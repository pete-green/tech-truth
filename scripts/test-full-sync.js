// Full sync test - mirrors the updated sync-data logic
// Run with: node scripts/test-full-sync.js

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

// Verizon auth (using Fleetmatics API with Basic Auth)
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
  console.log('TECH TRUTH - FULL SYNC TEST (GPS-VERIFIED ARRIVALS)');
  console.log('='.repeat(70));

  // Use yesterday for testing
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() - 1);
  const dateStr = targetDate.toISOString().split('T')[0];
  const startOfDay = new Date(dateStr + 'T00:00:00Z');
  const endOfDay = new Date(dateStr + 'T23:59:59Z');

  console.log(`\nTarget date: ${dateStr}`);

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

  // Step 2: Get APPOINTMENTS for the date
  console.log('\n--- Step 2: Get appointments for the date ---');
  const appointmentsResult = await stFetch(
    `/jpm/v2/tenant/${ST_CONFIG.tenantId}/appointments?` +
    `startsOnOrAfter=${startOfDay.toISOString()}&` +
    `startsBefore=${endOfDay.toISOString()}&` +
    `pageSize=200`
  );
  const appointments = appointmentsResult.data || [];
  console.log(`Found ${appointments.length} appointments for ${dateStr}`);

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

  for (const appointment of sortedAppointments) {
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

    // Get GPS history
    const gpsStart = new Date(scheduledTime.getTime() - 30 * 60 * 1000); // 30 min before
    const gpsEnd = new Date(scheduledTime.getTime() + 2 * 60 * 60 * 1000); // 2 hours after

    let gpsHistory = [];
    try {
      gpsHistory = await verizonFetch(
        `/rad/v1/vehicles/${techData.verizon_vehicle_id}/status/history?` +
        `startdatetimeutc=${gpsStart.toISOString()}&` +
        `enddatetimeutc=${gpsEnd.toISOString()}`
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

      if (varianceMinutes > 10) {
        console.log(`  ❌ LATE by ${varianceMinutes} minutes`);
        lateCount++;
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

      // If past scheduled time, mark as late
      if (new Date() > scheduledTime) {
        const varianceMinutes = Math.round((new Date() - scheduledTime) / 60000);
        console.log(`  ❌ LATE - No arrival detected (${varianceMinutes}+ minutes)`);
        lateCount++;
        results.push({ tech: techData.name, status: 'NO ARRIVAL', variance: varianceMinutes, closestFeet: Math.round(closestDist), address: jobAddress });
      }
    }
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`Technicians with trucks: ${techsWithTrucks.length}`);
  console.log(`First jobs processed: ${processedTechFirstJob.size}`);
  console.log(`Late arrivals: ${lateCount}`);
  console.log(`On-time/early arrivals: ${onTimeCount}`);
  console.log(`No GPS data: ${noDataCount}`);

  if (results.length > 0) {
    console.log('\nDetailed Results:');
    console.log('-'.repeat(70));
    for (const r of results) {
      const status = r.status === 'LATE' || r.status === 'NO ARRIVAL' ? '❌' : '✅';
      console.log(`${status} ${r.tech}: ${r.status} (${r.variance}m) - ${r.address}`);
    }
  }

  console.log('\n' + '='.repeat(70));
}

main().catch(console.error);
