// Backfill historical data for the past N days
// Run with: node scripts/backfill-history.js

require('dotenv').config({ path: '.env.local' });

const ST_CONFIG = {
  clientId: process.env.ST_CLIENT_ID,
  clientSecret: process.env.ST_CLIENT_SECRET,
  tenantId: process.env.ST_TENANT_ID,
  appKey: process.env.ST_APPLICATION_KEY,
};

const VERIZON_CONFIG = {
  apiUrl: process.env.VERIZON_API_URL || 'https://fim.api.us.fleetmatics.com',
  username: process.env.VERIZON_USERNAME,
  password: process.env.VERIZON_PASSWORD,
  appId: 'fleetmatics-p-us-IsVqHeP2nslCQYVYMBTpbPiFW6udcPl14dw5GAbA',
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const EST_TIMEZONE = 'America/New_York';

let stToken = null;
let verizonToken = null;

// Service Titan auth
async function getSTToken() {
  if (stToken) return stToken;
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: ST_CONFIG.clientId,
    client_secret: ST_CONFIG.clientSecret,
  });
  const res = await fetch('https://auth.servicetitan.io/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await res.json();
  stToken = data.access_token;
  return stToken;
}

async function stFetch(endpoint) {
  const token = await getSTToken();
  const res = await fetch(`https://api.servicetitan.io${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'ST-App-Key': ST_CONFIG.appKey,
      'Content-Type': 'application/json',
    },
  });
  return res.json();
}

// Verizon auth
function getBasicAuthHeader() {
  const credentials = `${VERIZON_CONFIG.username}:${VERIZON_CONFIG.password}`;
  return `Basic ${Buffer.from(credentials).toString('base64')}`;
}

async function getVerizonToken() {
  if (verizonToken) return verizonToken;
  const res = await fetch(`${VERIZON_CONFIG.apiUrl}/token`, {
    method: 'GET',
    headers: {
      Authorization: getBasicAuthHeader(),
      Accept: 'application/json',
    },
  });
  const text = await res.text();
  verizonToken = text.startsWith('{') ? JSON.parse(text).token : text;
  return verizonToken;
}

async function verizonFetch(endpoint) {
  const token = await getVerizonToken();
  const res = await fetch(`${VERIZON_CONFIG.apiUrl}${endpoint}`, {
    headers: {
      'Authorization': `Atmosphere atmosphere_app_id=${VERIZON_CONFIG.appId}, Bearer ${token}`,
      'Accept': 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`Verizon API error: ${res.status}`);
  }
  return res.json();
}

// Haversine distance calculation
function calculateDistanceFeet(lat1, lon1, lat2, lon2) {
  const R = 20902231;
  const toRad = (deg) => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const ARRIVAL_RADIUS_FEET = 300;

function parseVerizonUtc(timestamp) {
  if (timestamp.endsWith('Z') || timestamp.includes('+') || timestamp.includes('-', 10)) {
    return new Date(timestamp);
  }
  return new Date(timestamp + 'Z');
}

function findArrivalTime(gpsPoints, targetLat, targetLon, windowStart) {
  const windowStartTime = new Date(windowStart).getTime();
  const sorted = [...gpsPoints].sort((a, b) =>
    parseVerizonUtc(a.UpdateUtc).getTime() - parseVerizonUtc(b.UpdateUtc).getTime()
  );

  for (const point of sorted) {
    const pointTime = parseVerizonUtc(point.UpdateUtc).getTime();
    if (pointTime < windowStartTime) continue;

    const dist = calculateDistanceFeet(targetLat, targetLon, point.Latitude, point.Longitude);
    if (dist <= ARRIVAL_RADIUS_FEET) {
      return {
        arrivalTime: parseVerizonUtc(point.UpdateUtc),
        distanceFeet: dist,
        point,
      };
    }
  }
  return null;
}

function toEST(date) {
  return new Date(date).toLocaleString('en-US', {
    timeZone: EST_TIMEZONE,
    hour: 'numeric', minute: '2-digit', hour12: true
  });
}

// Convert EST date string to UTC boundaries
function getESTDayBoundaries(dateStr) {
  // Create date at midnight EST, convert to UTC
  const estMidnight = new Date(`${dateStr}T05:00:00Z`); // EST is UTC-5
  const estEndOfDay = new Date(`${dateStr}T05:00:00Z`);
  estEndOfDay.setDate(estEndOfDay.getDate() + 1);
  estEndOfDay.setSeconds(estEndOfDay.getSeconds() - 1);

  return {
    start: estMidnight.toISOString(),
    end: estEndOfDay.toISOString()
  };
}

async function syncDate(dateStr, techLookup) {
  const bounds = getESTDayBoundaries(dateStr);

  // Get appointments for this date
  const appointmentsResult = await stFetch(
    `/jpm/v2/tenant/${ST_CONFIG.tenantId}/appointments?` +
    `startsOnOrAfter=${bounds.start}&` +
    `startsBefore=${bounds.end}&` +
    `pageSize=200`
  );
  const appointments = appointmentsResult.data || [];

  if (appointments.length === 0) {
    return { date: dateStr, appointments: 0, processed: 0, late: 0, onTime: 0, noGps: 0 };
  }

  // Sort by start time
  const sortedAppointments = [...appointments].sort((a, b) =>
    new Date(a.start).getTime() - new Date(b.start).getTime()
  );

  const processedTechFirstJob = new Set();
  let processed = 0;
  let late = 0;
  let onTime = 0;
  let noGps = 0;

  for (const appointment of sortedAppointments) {
    const assignmentResult = await stFetch(
      `/dispatch/v2/tenant/${ST_CONFIG.tenantId}/appointment-assignments?jobId=${appointment.jobId}`
    );
    const assignments = assignmentResult.data || [];

    if (assignments.length === 0) continue;

    const assignment = assignments.find(a => a.active) || assignments[0];
    const stTechId = assignment.technicianId;

    const techData = techLookup.get(stTechId);
    if (!techData) continue;

    if (processedTechFirstJob.has(stTechId)) continue;
    processedTechFirstJob.add(stTechId);

    const scheduledTime = new Date(appointment.start);

    // Get job details
    const jobDetails = await stFetch(`/jpm/v2/tenant/${ST_CONFIG.tenantId}/jobs/${appointment.jobId}`);
    if (!jobDetails.locationId) continue;

    // Get location with coordinates
    const location = await stFetch(`/crm/v2/tenant/${ST_CONFIG.tenantId}/locations/${jobDetails.locationId}`);
    const addr = location.address;

    if (!addr?.latitude || !addr?.longitude) continue;

    // Get GPS history
    const gpsStart = new Date(scheduledTime.getTime() - 30 * 60 * 1000);
    const gpsEnd = new Date(scheduledTime.getTime() + 2 * 60 * 60 * 1000);

    let gpsHistory = [];
    try {
      gpsHistory = await verizonFetch(
        `/rad/v1/vehicles/${techData.verizon_vehicle_id}/status/history?` +
        `startdatetimeutc=${gpsStart.toISOString()}&` +
        `enddatetimeutc=${gpsEnd.toISOString()}`
      );
    } catch (err) {
      noGps++;
      continue;
    }

    if (gpsHistory.length === 0) {
      noGps++;
      continue;
    }

    // Find arrival
    const arrival = findArrivalTime(gpsHistory, addr.latitude, addr.longitude, gpsStart);

    // Upsert job
    const jobUpsert = {
      st_job_id: appointment.jobId,
      st_appointment_id: appointment.id,
      technician_id: techData.id,
      job_number: jobDetails.jobNumber || `${appointment.jobId}`,
      customer_name: location.name || null,
      job_date: dateStr,
      scheduled_start: appointment.start,
      actual_arrival: arrival?.arrivalTime.toISOString() || null,
      job_address: `${addr.street}, ${addr.city}, ${addr.state} ${addr.zip}`,
      job_latitude: addr.latitude,
      job_longitude: addr.longitude,
      is_first_job_of_day: true,
      status: appointment.status || 'Scheduled',
      updated_at: new Date().toISOString(),
    };

    const jobRes = await fetch(`${SUPABASE_URL}/rest/v1/jobs`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(jobUpsert),
    });
    const jobData = await jobRes.json();
    const savedJobId = Array.isArray(jobData) ? jobData[0]?.id : jobData?.id;

    if (arrival) {
      const varianceMinutes = Math.round((arrival.arrivalTime.getTime() - scheduledTime.getTime()) / 60000);

      if (varianceMinutes > 10 && savedJobId) {
        // Create discrepancy
        const discrepancy = {
          technician_id: techData.id,
          job_id: savedJobId,
          job_date: dateStr,
          scheduled_arrival: appointment.start,
          actual_arrival: arrival.arrivalTime.toISOString(),
          variance_minutes: varianceMinutes,
          is_late: true,
          is_first_job: true,
          notes: `GPS arrival at ${toEST(arrival.arrivalTime)} - ${varianceMinutes}m late (${Math.round(arrival.distanceFeet)} ft from job)`,
        };

        await fetch(`${SUPABASE_URL}/rest/v1/arrival_discrepancies`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates',
          },
          body: JSON.stringify(discrepancy),
        });

        late++;
      } else {
        onTime++;
      }
      processed++;
    } else {
      noGps++;
    }
  }

  return { date: dateStr, appointments: appointments.length, processed, late, onTime, noGps };
}

async function main() {
  const DAYS_TO_BACKFILL = 14; // 2 weeks

  console.log('='.repeat(70));
  console.log('TECH TRUTH - BACKFILL HISTORICAL DATA');
  console.log('='.repeat(70));
  console.log(`\nBackfilling ${DAYS_TO_BACKFILL} days of data...\n`);

  // Get technicians with trucks
  const techRes = await fetch(`${SUPABASE_URL}/rest/v1/technicians?verizon_vehicle_id=not.is.null&select=*`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
  });
  const techsWithTrucks = await techRes.json();
  console.log(`Found ${techsWithTrucks.length} technicians with trucks\n`);

  const techLookup = new Map();
  for (const t of techsWithTrucks) {
    techLookup.set(t.st_technician_id, t);
  }

  // Generate dates to backfill (excluding today and yesterday which we already have)
  const dates = [];
  for (let i = 2; i <= DAYS_TO_BACKFILL; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];

    // Skip weekends
    const dayOfWeek = d.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      console.log(`Skipping ${dateStr} (weekend)`);
      continue;
    }

    dates.push(dateStr);
  }

  console.log(`Processing ${dates.length} work days...\n`);
  console.log('-'.repeat(70));

  const results = [];
  for (const dateStr of dates) {
    process.stdout.write(`${dateStr}: `);
    try {
      const result = await syncDate(dateStr, techLookup);
      results.push(result);
      console.log(`${result.appointments} appts, ${result.processed} processed, ${result.late} late, ${result.onTime} on-time, ${result.noGps} no GPS`);
    } catch (err) {
      console.log(`ERROR - ${err.message}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('BACKFILL COMPLETE');
  console.log('='.repeat(70));

  const totals = results.reduce((acc, r) => ({
    appointments: acc.appointments + r.appointments,
    processed: acc.processed + r.processed,
    late: acc.late + r.late,
    onTime: acc.onTime + r.onTime,
    noGps: acc.noGps + r.noGps,
  }), { appointments: 0, processed: 0, late: 0, onTime: 0, noGps: 0 });

  console.log(`Days processed: ${results.length}`);
  console.log(`Total appointments: ${totals.appointments}`);
  console.log(`Jobs with GPS verification: ${totals.processed}`);
  console.log(`Late arrivals: ${totals.late}`);
  console.log(`On-time arrivals: ${totals.onTime}`);
  console.log(`No GPS data: ${totals.noGps}`);
  console.log(`\nOn-time rate: ${totals.processed > 0 ? ((totals.onTime / totals.processed) * 100).toFixed(1) : 0}%`);
}

main().catch(console.error);
