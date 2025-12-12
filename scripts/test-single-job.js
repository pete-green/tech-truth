// Test single job arrival detection with full detail
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

function toEST(date) {
  return new Date(date).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
}

async function main() {
  console.log('='.repeat(70));
  console.log('SINGLE JOB ARRIVAL DETECTION TEST');
  console.log('='.repeat(70));

  // Get yesterday's 8 AM EST job (Job 162941874 - Dakota Gentle)
  const jobId = 162941874;

  // Get job details
  console.log(`\n1. Getting job ${jobId} details...`);
  const job = await stFetch(`/jpm/v2/tenant/${ST_CONFIG.tenantId}/jobs/${jobId}`);
  console.log(`   Job Number: ${job.jobNumber}`);
  console.log(`   Location ID: ${job.locationId}`);

  // Get appointment
  console.log(`\n2. Getting appointment...`);
  const apt = await stFetch(`/jpm/v2/tenant/${ST_CONFIG.tenantId}/appointments/${job.firstAppointmentId}`);
  console.log(`   Raw start: ${apt.start}`);
  console.log(`   Scheduled (EST): ${toEST(apt.start)}`);

  // Get technician assignment
  console.log(`\n3. Getting technician assignment...`);
  const assignments = await stFetch(`/dispatch/v2/tenant/${ST_CONFIG.tenantId}/appointment-assignments?jobId=${jobId}`);
  const assignment = assignments.data?.[0];
  console.log(`   Technician: ${assignment?.technicianName} (ID: ${assignment?.technicianId})`);

  // Get tech's truck from Supabase
  console.log(`\n4. Getting truck assignment from Supabase...`);
  const techRes = await fetch(
    `${SUPABASE_URL}/rest/v1/technicians?st_technician_id=eq.${assignment.technicianId}&select=*`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  const techs = await techRes.json();
  const tech = techs[0];
  console.log(`   Vehicle ID: ${tech?.verizon_vehicle_id}`);

  // Get location
  console.log(`\n5. Getting job location coordinates...`);
  const location = await stFetch(`/crm/v2/tenant/${ST_CONFIG.tenantId}/locations/${job.locationId}`);
  const addr = location.address;
  console.log(`   Address: ${addr.street}, ${addr.city}, ${addr.state}`);
  console.log(`   Coordinates: ${addr.latitude}, ${addr.longitude}`);

  // Get GPS history
  console.log(`\n6. Getting GPS history...`);
  const scheduledTime = new Date(apt.start);
  const gpsStart = new Date(scheduledTime.getTime() - 30 * 60 * 1000).toISOString();
  const gpsEnd = new Date(scheduledTime.getTime() + 2 * 60 * 60 * 1000).toISOString();
  console.log(`   Window: ${toEST(gpsStart)} to ${toEST(gpsEnd)}`);

  const gpsHistory = await verizonFetch(
    `/rad/v1/vehicles/${tech.verizon_vehicle_id}/status/history?startdatetimeutc=${gpsStart}&enddatetimeutc=${gpsEnd}`
  );
  console.log(`   GPS points: ${gpsHistory.length}`);

  // Find arrival
  console.log(`\n7. Finding arrival (within 300 feet)...`);
  const ARRIVAL_RADIUS = 300;
  let arrival = null;
  let closestDist = Infinity;
  let closestPoint = null;

  for (const point of gpsHistory) {
    const dist = calculateDistanceFeet(addr.latitude, addr.longitude, point.Latitude, point.Longitude);
    if (dist < closestDist) {
      closestDist = dist;
      closestPoint = point;
    }
    if (!arrival && dist <= ARRIVAL_RADIUS) {
      arrival = { time: new Date(point.UpdateUtc), dist, point };
    }
  }

  console.log(`   Closest approach: ${Math.round(closestDist)} feet at ${toEST(closestPoint?.UpdateUtc)}`);
  console.log(`   Closest address: ${closestPoint?.Address?.AddressLine1}`);

  if (arrival) {
    console.log(`\n   ✅ ARRIVAL DETECTED:`);
    console.log(`      Time (EST): ${toEST(arrival.time)}`);
    console.log(`      Distance: ${Math.round(arrival.dist)} feet`);
    console.log(`      GPS Address: ${arrival.point.Address?.AddressLine1}`);

    const varianceMs = arrival.time.getTime() - scheduledTime.getTime();
    const varianceMinutes = Math.round(varianceMs / 60000);
    console.log(`\n   VARIANCE: ${varianceMinutes} minutes`);
    if (varianceMinutes > 10) {
      console.log(`   ❌ LATE by ${varianceMinutes - 10} minutes (10 min grace)`);
    } else if (varianceMinutes < 0) {
      console.log(`   ✅ EARLY by ${Math.abs(varianceMinutes)} minutes`);
    } else {
      console.log(`   ✅ ON TIME (within 10 min window)`);
    }
  } else {
    console.log(`\n   ❌ NO ARRIVAL detected within ${ARRIVAL_RADIUS} feet`);
  }

  console.log('\n' + '='.repeat(70));
}

main().catch(console.error);
