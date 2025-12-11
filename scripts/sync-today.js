// Sync today's data and save to Supabase
// Run with: node scripts/sync-today.js

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

// Get vehicle segments for same-day data
async function getVehicleSegments(vehicleNumber, startDateUtc) {
  const response = await verizonFetch(`/rad/v1/vehicles/${vehicleNumber}/segments?startdateutc=${startDateUtc}`);
  // API returns an array with one element
  if (Array.isArray(response) && response.length > 0) {
    return response[0];
  }
  return response;
}

// Convert segments to GPS points for arrival detection
function segmentsToGPSPoints(segments) {
  const points = [];
  for (const segment of segments) {
    if (segment.EndLocation && segment.EndDateUtc) {
      points.push({
        UpdateUtc: segment.EndDateUtc,
        Latitude: segment.EndLocation.Latitude,
        Longitude: segment.EndLocation.Longitude,
        Address: segment.EndLocation,
        Speed: 0,
      });
    }
  }
  return points;
}

// Smart GPS data fetcher - uses segments for today, history for past
async function getVehicleGPSData(vehicleNumber, startTime, endTime) {
  const startDate = new Date(startTime);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isToday = startDate >= today;

  if (isToday) {
    try {
      const todayStr = today.toISOString().split('T')[0] + 'T00:00:00Z';
      const segmentsData = await getVehicleSegments(vehicleNumber, todayStr);
      return segmentsToGPSPoints(segmentsData.Segments || []);
    } catch (error) {
      console.log('    Segments failed, trying history...');
    }
  }

  // Use history for past days or as fallback
  try {
    return await verizonFetch(
      `/rad/v1/vehicles/${vehicleNumber}/status/history?` +
      `startdatetimeutc=${startTime}&enddatetimeutc=${endTime}`
    );
  } catch (error) {
    console.log('    GPS history also failed');
    return [];
  }
}

// Haversine distance calculation
function calculateDistanceFeet(lat1, lon1, lat2, lon2) {
  const R = 20902231; // Earth's radius in feet
  const toRad = (deg) => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const ARRIVAL_RADIUS_FEET = 300;

// CRITICAL: Parse Verizon timestamps as UTC (they don't include Z suffix)
function parseVerizonUtc(timestamp) {
  if (timestamp.endsWith('Z') || timestamp.includes('+') || timestamp.includes('-', 10)) {
    return new Date(timestamp);
  }
  return new Date(timestamp + 'Z');
}

function findArrivalTime(gpsPoints, targetLat, targetLon, windowStart) {
  const windowStartTime = new Date(windowStart).getTime();

  // Sort by time (using UTC parsing)
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

// Format time in EST
function toEST(date) {
  return new Date(date).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric', minute: '2-digit', hour12: true
  });
}

async function main() {
  console.log('='.repeat(70));
  console.log('TECH TRUTH - SYNC TODAY');
  console.log('='.repeat(70));

  // Use TODAY
  const targetDate = new Date();
  const dateStr = targetDate.toISOString().split('T')[0];
  const startOfDay = new Date(dateStr + 'T00:00:00Z');
  const endOfDay = new Date(dateStr + 'T23:59:59Z');

  console.log(`\nTarget date: ${dateStr} (TODAY)`);
  console.log(`Current time: ${toEST(new Date())} EST`);

  // Step 1: Get technicians with trucks from Supabase
  console.log('\n--- Step 1: Get technicians with trucks ---');
  const techRes = await fetch(`${SUPABASE_URL}/rest/v1/technicians?verizon_vehicle_id=not.is.null&select=*`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
  });
  const techsWithTrucks = await techRes.json();
  console.log(`Found ${techsWithTrucks.length} technicians with trucks`);

  const techLookup = new Map();
  for (const t of techsWithTrucks) {
    techLookup.set(t.st_technician_id, t);
  }

  // Step 2: Get APPOINTMENTS for today
  console.log('\n--- Step 2: Get appointments for today ---');
  const appointmentsResult = await stFetch(
    `/jpm/v2/tenant/${ST_CONFIG.tenantId}/appointments?` +
    `startsOnOrAfter=${startOfDay.toISOString()}&` +
    `startsBefore=${endOfDay.toISOString()}&` +
    `pageSize=200`
  );
  const appointments = appointmentsResult.data || [];
  console.log(`Found ${appointments.length} appointments for ${dateStr}`);

  if (appointments.length === 0) {
    console.log('\nNo appointments found for today.');
    return;
  }

  // Sort by start time
  const sortedAppointments = [...appointments].sort((a, b) =>
    new Date(a.start).getTime() - new Date(b.start).getTime()
  );

  // Step 3: Process each appointment
  console.log('\n--- Step 3: Process appointments with GPS verification ---');

  const processedTechFirstJob = new Set();
  const results = [];
  let lateCount = 0;
  let onTimeCount = 0;
  let noDataCount = 0;
  let futureCount = 0;
  let jobsProcessed = 0;

  for (const appointment of sortedAppointments) {
    // Skip canceled appointments
    if (appointment.status === 'Canceled') {
      continue;
    }

    // Get tech assignment for this job
    const assignmentResult = await stFetch(
      `/dispatch/v2/tenant/${ST_CONFIG.tenantId}/appointment-assignments?jobId=${appointment.jobId}`
    );
    const assignments = assignmentResult.data || [];

    if (assignments.length === 0) continue;

    const assignment = assignments.find(a => a.active) || assignments[0];
    const stTechId = assignment.technicianId;

    // Check if tech has truck
    const techData = techLookup.get(stTechId);
    if (!techData) continue;

    // Only process first job per tech
    if (processedTechFirstJob.has(stTechId)) continue;
    processedTechFirstJob.add(stTechId);

    const scheduledTime = new Date(appointment.start);
    const scheduledStr = toEST(scheduledTime);

    // Skip future appointments (scheduled time hasn't passed yet)
    if (scheduledTime > new Date()) {
      console.log(`\n${techData.name}: Job scheduled for ${scheduledStr} (FUTURE - skipping)`);
      futureCount++;
      continue;
    }

    console.log(`\n${techData.name}:`);
    console.log(`  Job ${appointment.jobId} scheduled for ${scheduledStr}`);

    // Get job details
    const jobDetails = await stFetch(`/jpm/v2/tenant/${ST_CONFIG.tenantId}/jobs/${appointment.jobId}`);
    if (!jobDetails.locationId) {
      console.log(`  ⚠️ No location ID`);
      continue;
    }

    // Get location with coordinates
    const location = await stFetch(`/crm/v2/tenant/${ST_CONFIG.tenantId}/locations/${jobDetails.locationId}`);
    const addr = location.address;

    if (!addr?.latitude || !addr?.longitude) {
      console.log(`  ⚠️ No coordinates for location`);
      continue;
    }

    const jobAddress = `${addr.street}, ${addr.city}`;
    console.log(`  Address: ${jobAddress}`);
    console.log(`  Coordinates: ${addr.latitude}, ${addr.longitude}`);

    // Get GPS data - uses segments for today, history for past
    const gpsStart = new Date(scheduledTime.getTime() - 30 * 60 * 1000); // 30 min before
    const gpsEnd = new Date(scheduledTime.getTime() + 2 * 60 * 60 * 1000); // 2 hours after

    let gpsHistory = [];
    try {
      gpsHistory = await getVehicleGPSData(
        techData.verizon_vehicle_id,
        gpsStart.toISOString(),
        gpsEnd.toISOString()
      );
      console.log(`  GPS points: ${gpsHistory.length}`);
    } catch (err) {
      console.log(`  ⚠️ GPS fetch error: ${err.message}`);
      noDataCount++;
      continue;
    }

    if (gpsHistory.length === 0) {
      console.log(`  ⚠️ No GPS data for time window`);
      noDataCount++;
      continue;
    }

    // Find arrival
    const arrival = findArrivalTime(gpsHistory, addr.latitude, addr.longitude, gpsStart);

    if (arrival) {
      const arrivalStr = toEST(arrival.arrivalTime);
      const varianceMs = arrival.arrivalTime.getTime() - scheduledTime.getTime();
      const varianceMinutes = Math.round(varianceMs / 60000);

      console.log(`  GPS Arrival: ${arrivalStr} (${Math.round(arrival.distanceFeet)} ft from job)`);

      // Upsert job to Supabase
      const jobUpsert = {
        st_job_id: appointment.jobId,
        st_appointment_id: appointment.id,
        technician_id: techData.id,
        job_number: jobDetails.jobNumber || `${appointment.jobId}`,
        customer_name: location.name || null,
        job_date: dateStr,
        scheduled_start: appointment.start,
        actual_arrival: arrival.arrivalTime.toISOString(),
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

      if (varianceMinutes > 10) {
        console.log(`  ❌ LATE by ${varianceMinutes} minutes`);
        lateCount++;

        // Create discrepancy record
        if (savedJobId) {
          const discrepancy = {
            technician_id: techData.id,
            job_id: savedJobId,
            job_date: dateStr,
            scheduled_arrival: appointment.start,
            actual_arrival: arrival.arrivalTime.toISOString(),
            variance_minutes: varianceMinutes,
            is_late: true,
            is_first_job: true,
            notes: `GPS arrival at ${arrivalStr} - ${varianceMinutes}m late (${Math.round(arrival.distanceFeet)} ft from job)`,
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
        }

        results.push({ tech: techData.name, status: 'LATE', variance: varianceMinutes, address: jobAddress });
      } else if (varianceMinutes < 0) {
        console.log(`  ✅ EARLY by ${Math.abs(varianceMinutes)} minutes`);
        onTimeCount++;
        results.push({ tech: techData.name, status: 'EARLY', variance: varianceMinutes, address: jobAddress });
      } else {
        console.log(`  ✅ ON TIME (${varianceMinutes} minutes after scheduled)`);
        onTimeCount++;
        results.push({ tech: techData.name, status: 'ON TIME', variance: varianceMinutes, address: jobAddress });
      }

      jobsProcessed++;
    } else {
      // Find closest approach
      let closestDist = Infinity;
      let closestPoint = null;
      for (const p of gpsHistory) {
        const d = calculateDistanceFeet(addr.latitude, addr.longitude, p.Latitude, p.Longitude);
        if (d < closestDist) {
          closestDist = d;
          closestPoint = p;
        }
      }

      console.log(`  ⚠️ NO ARRIVAL within ${ARRIVAL_RADIUS_FEET} feet`);
      console.log(`  Closest approach: ${Math.round(closestDist)} feet at ${closestPoint?.UpdateUtc}`);
      noDataCount++;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`Technicians with trucks: ${techsWithTrucks.length}`);
  console.log(`Appointments found: ${appointments.length}`);
  console.log(`First jobs processed: ${jobsProcessed}`);
  console.log(`Future jobs (skipped): ${futureCount}`);
  console.log(`Late arrivals: ${lateCount}`);
  console.log(`On-time/early arrivals: ${onTimeCount}`);
  console.log(`No GPS data: ${noDataCount}`);

  if (results.length > 0) {
    console.log('\nResults saved to database:');
    console.log('-'.repeat(70));
    for (const r of results) {
      const status = r.status === 'LATE' ? '❌' : '✅';
      console.log(`${status} ${r.tech}: ${r.status} (${r.variance}m) - ${r.address}`);
    }
  }

  console.log('\n' + '='.repeat(70));
}

main().catch(console.error);
