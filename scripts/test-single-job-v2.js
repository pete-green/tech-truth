// Test single job arrival detection with CORRECT UTC parsing
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

// Service Titan
let stToken = null;
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
    headers: { 'Authorization': `Bearer ${token}`, 'ST-App-Key': ST_CONFIG.appKey },
  });
  return res.json();
}

// Verizon
let verizonToken = null;
async function getVerizonToken() {
  if (verizonToken) return verizonToken;
  const credentials = `${VERIZON_CONFIG.username}:${VERIZON_CONFIG.password}`;
  const res = await fetch(`${VERIZON_CONFIG.apiUrl}/token`, {
    method: 'GET',
    headers: { Authorization: `Basic ${Buffer.from(credentials).toString('base64')}` },
  });
  const text = await res.text();
  verizonToken = text.startsWith('{') ? JSON.parse(text).token : text;
  return verizonToken;
}

async function verizonFetch(endpoint) {
  const token = await getVerizonToken();
  const res = await fetch(`${VERIZON_CONFIG.apiUrl}${endpoint}`, {
    headers: { Authorization: `Atmosphere atmosphere_app_id=${VERIZON_CONFIG.appId}, Bearer ${token}` },
  });
  return res.json();
}

// Distance calc
function calculateDistanceFeet(lat1, lon1, lat2, lon2) {
  const R = 20902231;
  const toRad = (deg) => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// CRITICAL: Parse Verizon timestamps as UTC (they don't include Z suffix)
function parseVerizonUtc(timestamp) {
  if (timestamp.endsWith('Z')) return new Date(timestamp);
  return new Date(timestamp + 'Z');
}

function toEST(date) {
  return new Date(date).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
}

async function main() {
  console.log('='.repeat(70));
  console.log('SINGLE JOB ARRIVAL DETECTION - CORRECTED UTC PARSING');
  console.log('='.repeat(70));

  // Job 162941874 - Dakota Gentle - 8:00 AM EST job
  const jobId = 162941874;

  // Get job details
  console.log(`\n1. Getting job ${jobId} details...`);
  const job = await stFetch(`/jpm/v2/tenant/${ST_CONFIG.tenantId}/jobs/${jobId}`);
  console.log(`   Job Number: ${job.jobNumber}`);

  // Get appointment
  console.log(`\n2. Getting appointment...`);
  const apt = await stFetch(`/jpm/v2/tenant/${ST_CONFIG.tenantId}/appointments/${job.firstAppointmentId}`);
  const scheduledTime = new Date(apt.start); // Service Titan uses proper ISO with Z
  console.log(`   Raw start: ${apt.start}`);
  console.log(`   Scheduled (EST): ${toEST(scheduledTime)}`);
  console.log(`   Scheduled (UTC): ${scheduledTime.toISOString()}`);

  // Get technician assignment
  console.log(`\n3. Getting technician assignment...`);
  const assignments = await stFetch(`/dispatch/v2/tenant/${ST_CONFIG.tenantId}/appointment-assignments?jobId=${jobId}`);
  const assignment = assignments.data?.[0];
  console.log(`   Technician: ${assignment?.technicianName}`);

  // Get tech's truck from Supabase
  console.log(`\n4. Getting truck assignment...`);
  const techRes = await fetch(
    `${SUPABASE_URL}/rest/v1/technicians?st_technician_id=eq.${assignment.technicianId}&select=*`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  const tech = (await techRes.json())[0];
  console.log(`   Vehicle ID: ${tech?.verizon_vehicle_id}`);

  // Get location
  console.log(`\n5. Getting job location...`);
  const location = await stFetch(`/crm/v2/tenant/${ST_CONFIG.tenantId}/locations/${job.locationId}`);
  const addr = location.address;
  console.log(`   Address: ${addr.street}, ${addr.city}, ${addr.state}`);
  console.log(`   Coordinates: ${addr.latitude}, ${addr.longitude}`);

  // Get GPS history - window around scheduled time
  console.log(`\n6. Getting GPS history...`);
  const gpsStart = new Date(scheduledTime.getTime() - 30 * 60 * 1000); // 30 min before
  const gpsEnd = new Date(scheduledTime.getTime() + 2 * 60 * 60 * 1000); // 2 hours after
  console.log(`   Window (EST): ${toEST(gpsStart)} to ${toEST(gpsEnd)}`);
  console.log(`   Window (UTC): ${gpsStart.toISOString()} to ${gpsEnd.toISOString()}`);

  const gpsHistory = await verizonFetch(
    `/rad/v1/vehicles/${tech.verizon_vehicle_id}/status/history?startdatetimeutc=${gpsStart.toISOString()}&enddatetimeutc=${gpsEnd.toISOString()}`
  );
  console.log(`   GPS points: ${gpsHistory.length}`);

  if (gpsHistory.length > 0) {
    const first = gpsHistory[0];
    const last = gpsHistory[gpsHistory.length - 1];
    console.log(`   First point: ${first.UpdateUtc} => ${toEST(parseVerizonUtc(first.UpdateUtc))} EST`);
    console.log(`   Last point: ${last.UpdateUtc} => ${toEST(parseVerizonUtc(last.UpdateUtc))} EST`);
  }

  // Find arrival with CORRECT UTC parsing
  console.log(`\n7. Finding arrival (within 300 feet)...`);
  const ARRIVAL_RADIUS = 300;
  const windowStartTime = new Date(scheduledTime.getTime() - 30 * 60 * 1000);
  let arrival = null;
  let closestDist = Infinity;
  let closestPoint = null;

  // Sort by time
  const sortedPoints = [...gpsHistory].sort((a, b) =>
    parseVerizonUtc(a.UpdateUtc).getTime() - parseVerizonUtc(b.UpdateUtc).getTime()
  );

  for (const point of sortedPoints) {
    const pointTime = parseVerizonUtc(point.UpdateUtc);
    const dist = calculateDistanceFeet(addr.latitude, addr.longitude, point.Latitude, point.Longitude);

    if (dist < closestDist) {
      closestDist = dist;
      closestPoint = { point, time: pointTime };
    }

    // Find first arrival within radius after window start
    if (!arrival && pointTime >= windowStartTime && dist <= ARRIVAL_RADIUS) {
      arrival = { time: pointTime, dist, point };
    }
  }

  console.log(`   Closest approach: ${Math.round(closestDist)} feet`);
  console.log(`     At: ${toEST(closestPoint?.time)} EST`);
  console.log(`     Address: ${closestPoint?.point?.Address?.AddressLine1}`);

  if (arrival) {
    console.log(`\n   ✅ ARRIVAL DETECTED:`);
    console.log(`      Time (EST): ${toEST(arrival.time)}`);
    console.log(`      Distance: ${Math.round(arrival.dist)} feet`);
    console.log(`      GPS Address: ${arrival.point.Address?.AddressLine1}`);

    const varianceMinutes = Math.round((arrival.time.getTime() - scheduledTime.getTime()) / 60000);
    console.log(`\n   VARIANCE: ${varianceMinutes} minutes`);
    if (varianceMinutes > 10) {
      console.log(`   ❌ LATE by ${varianceMinutes} minutes`);
    } else if (varianceMinutes < 0) {
      console.log(`   ✅ EARLY by ${Math.abs(varianceMinutes)} minutes`);
    } else {
      console.log(`   ✅ ON TIME (${varianceMinutes} minutes after scheduled)`);
    }
  } else {
    console.log(`\n   ❌ NO ARRIVAL detected within ${ARRIVAL_RADIUS} feet`);
  }

  console.log('\n' + '='.repeat(70));
}

main().catch(console.error);
