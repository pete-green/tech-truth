// Debug script to trace through the sync process step by step
// Run with: node scripts/test-sync-debug.js

require('dotenv').config({ path: '.env.local' });

const ST_CONFIG = {
  clientId: process.env.SERVICE_TITAN_CLIENT_ID,
  clientSecret: process.env.SERVICE_TITAN_CLIENT_SECRET,
  tenantId: process.env.SERVICE_TITAN_TENANT_ID,
  appKey: process.env.SERVICE_TITAN_APP_KEY,
};

const VERIZON_CONFIG = {
  username: process.env.VERIZON_USERNAME,
  password: process.env.VERIZON_PASSWORD,
  appId: process.env.VERIZON_APP_ID,
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
async function getVerizonToken() {
  if (verizonToken) return verizonToken;

  const res = await fetch('https://api.verizonconnect.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      username: VERIZON_CONFIG.username,
      password: VERIZON_CONFIG.password,
      client_id: VERIZON_CONFIG.appId,
    }).toString(),
  });

  const data = await res.json();
  verizonToken = data.access_token;
  return verizonToken;
}

async function verizonFetch(endpoint) {
  const token = await getVerizonToken();
  const res = await fetch(`https://api.verizonconnect.com${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    },
  });
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

async function main() {
  console.log('='.repeat(60));
  console.log('TECH TRUTH SYNC DEBUG');
  console.log('='.repeat(60));

  // Use yesterday for testing (more likely to have complete data)
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() - 1);
  const dateStr = targetDate.toISOString().split('T')[0];

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
  console.log(`Found ${techsWithTrucks.length} technicians with trucks assigned:`);
  for (const t of techsWithTrucks) {
    console.log(`  - ${t.name} (ST ID: ${t.st_technician_id}, Vehicle: ${t.verizon_vehicle_id})`);
  }

  // Step 2: Get appointment assignments for the date
  console.log('\n--- Step 2: Get appointment assignments ---');
  const startOfDay = new Date(dateStr + 'T00:00:00');
  const endOfDay = new Date(dateStr + 'T23:59:59');

  const assignmentsData = await stFetch(
    `/dispatch/v2/tenant/${ST_CONFIG.tenantId}/appointment-assignments?` +
    `startsOnOrAfter=${startOfDay.toISOString()}&` +
    `startsBefore=${endOfDay.toISOString()}&` +
    `pageSize=200`
  );

  const assignments = assignmentsData.data || [];
  console.log(`Found ${assignments.length} total assignments for ${dateStr}`);

  // Filter to our techs with trucks
  const techIds = new Set(techsWithTrucks.map(t => t.st_technician_id));
  const relevantAssignments = assignments.filter(a => techIds.has(a.technicianId));
  console.log(`${relevantAssignments.length} assignments are for technicians with trucks`);

  // Group by tech and get first job
  const techAssignments = {};
  for (const a of relevantAssignments) {
    if (!techAssignments[a.technicianId]) {
      techAssignments[a.technicianId] = [];
    }
    techAssignments[a.technicianId].push(a);
  }

  // Sort each tech's jobs by time
  for (const techId of Object.keys(techAssignments)) {
    techAssignments[techId].sort((a, b) =>
      new Date(a.assignedOn).getTime() - new Date(b.assignedOn).getTime()
    );
  }

  console.log(`\nFirst jobs by technician:`);
  for (const [stTechId, jobs] of Object.entries(techAssignments)) {
    const tech = techsWithTrucks.find(t => t.st_technician_id === parseInt(stTechId));
    const firstJob = jobs[0];
    console.log(`  - ${tech?.name}: Job ${firstJob.jobId} at ${firstJob.assignedOn}`);
  }

  // Step 3: For one technician, trace the full flow
  console.log('\n--- Step 3: Detailed trace for first technician ---');

  const [firstTechId, firstTechJobs] = Object.entries(techAssignments)[0];
  const tech = techsWithTrucks.find(t => t.st_technician_id === parseInt(firstTechId));
  const firstAssignment = firstTechJobs[0];

  console.log(`\nTechnician: ${tech.name}`);
  console.log(`Job ID: ${firstAssignment.jobId}`);
  console.log(`Scheduled time: ${firstAssignment.assignedOn}`);

  // Get job details
  console.log('\n  Getting job details...');
  const jobDetails = await stFetch(`/jpm/v2/tenant/${ST_CONFIG.tenantId}/jobs/${firstAssignment.jobId}`);
  console.log(`  Location ID: ${jobDetails.locationId}`);
  console.log(`  Job Number: ${jobDetails.jobNumber}`);

  // Get location with coordinates
  console.log('\n  Getting location...');
  const location = await stFetch(`/crm/v2/tenant/${ST_CONFIG.tenantId}/locations/${jobDetails.locationId}`);
  const addr = location.address;
  console.log(`  Address: ${addr?.street}, ${addr?.city}, ${addr?.state} ${addr?.zip}`);
  console.log(`  Coordinates: ${addr?.latitude}, ${addr?.longitude}`);

  if (!addr?.latitude || !addr?.longitude) {
    console.log('  ❌ NO COORDINATES - cannot detect arrival');
    return;
  }

  // Get GPS history
  console.log('\n  Getting GPS history...');
  const scheduledTime = new Date(firstAssignment.assignedOn);
  const gpsStart = new Date(scheduledTime.getTime() - 30 * 60 * 1000); // 30 min before
  const gpsEnd = new Date(scheduledTime.getTime() + 2 * 60 * 60 * 1000); // 2 hours after

  console.log(`  Vehicle: ${tech.verizon_vehicle_id}`);
  console.log(`  Time window: ${gpsStart.toISOString()} to ${gpsEnd.toISOString()}`);

  const gpsHistory = await verizonFetch(
    `/rad/v1/vehicles/${tech.verizon_vehicle_id}/status/history?` +
    `startdatetimeutc=${gpsStart.toISOString()}&` +
    `enddatetimeutc=${gpsEnd.toISOString()}`
  );

  console.log(`  Got ${gpsHistory.length} GPS points`);

  if (gpsHistory.length === 0) {
    console.log('  ❌ NO GPS DATA for this time window');
    return;
  }

  // Find closest approach to job
  console.log('\n  Analyzing GPS points...');
  let closestDistance = Infinity;
  let closestPoint = null;
  let arrivalPoint = null;
  const ARRIVAL_RADIUS = 300;

  for (const point of gpsHistory) {
    const dist = calculateDistanceFeet(
      addr.latitude, addr.longitude,
      point.Latitude, point.Longitude
    );

    if (dist < closestDistance) {
      closestDistance = dist;
      closestPoint = point;
    }

    // First point within arrival radius
    if (!arrivalPoint && dist <= ARRIVAL_RADIUS) {
      arrivalPoint = point;
    }
  }

  console.log(`\n  Closest approach: ${Math.round(closestDistance)} feet at ${closestPoint?.UpdateUtc}`);
  console.log(`  Closest point address: ${closestPoint?.Address?.AddressLine1}`);

  if (arrivalPoint) {
    console.log(`\n  ✅ ARRIVAL DETECTED at ${arrivalPoint.UpdateUtc}`);
    const arrivalTime = new Date(arrivalPoint.UpdateUtc);
    const varianceMs = arrivalTime.getTime() - scheduledTime.getTime();
    const varianceMinutes = Math.round(varianceMs / 60000);
    console.log(`  Variance: ${varianceMinutes} minutes (${varianceMinutes > 0 ? 'LATE' : 'EARLY'})`);
  } else {
    console.log(`\n  ❌ NO ARRIVAL within ${ARRIVAL_RADIUS} feet`);
    console.log(`  Closest was ${Math.round(closestDistance)} feet`);
  }

  // Show first and last few GPS points
  console.log('\n  GPS points timeline:');
  const pointsToShow = [...gpsHistory.slice(0, 3), '...', ...gpsHistory.slice(-3)];
  for (const p of pointsToShow) {
    if (p === '...') {
      console.log('    ...');
      continue;
    }
    const dist = calculateDistanceFeet(addr.latitude, addr.longitude, p.Latitude, p.Longitude);
    console.log(`    ${p.UpdateUtc} - ${Math.round(dist)} ft - ${p.Address?.AddressLine1 || 'N/A'}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('DEBUG COMPLETE');
  console.log('='.repeat(60));
}

main().catch(console.error);
