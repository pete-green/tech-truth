// Test Service Titan appointments endpoint (the one with correct dates)
// Run with: node scripts/test-st-appointments-v2.js

require('dotenv').config({ path: '.env.local' });

const ST_CONFIG = {
  clientId: process.env.ST_CLIENT_ID,
  clientSecret: process.env.ST_CLIENT_SECRET,
  tenantId: process.env.ST_TENANT_ID,
  appKey: process.env.ST_APPLICATION_KEY,
};

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
  console.log(`Fetching: ${endpoint}`);
  const res = await fetch(`https://api.servicetitan.io${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'ST-App-Key': ST_CONFIG.appKey,
      'Content-Type': 'application/json',
    },
  });
  const data = await res.json();
  return data;
}

async function main() {
  console.log('='.repeat(60));
  console.log('SERVICE TITAN APPOINTMENTS TEST (jpm/v2)');
  console.log('='.repeat(60));

  // Test yesterday
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split('T')[0];
  const startOfDay = new Date(dateStr + 'T00:00:00Z');
  const endOfDay = new Date(dateStr + 'T23:59:59Z');

  console.log(`\nFetching appointments for ${dateStr}`);

  // Get appointments
  const appointmentsResult = await stFetch(
    `/jpm/v2/tenant/${ST_CONFIG.tenantId}/appointments?` +
    `startsOnOrAfter=${startOfDay.toISOString()}&` +
    `startsBefore=${endOfDay.toISOString()}&` +
    `pageSize=200`
  );

  const appointments = appointmentsResult.data || [];
  console.log(`\nFound ${appointments.length} appointments`);

  // Show first few with details
  console.log('\nFirst 10 appointments:');
  for (const apt of appointments.slice(0, 10)) {
    console.log(`\n  Appointment ${apt.id}:`);
    console.log(`    Job ID: ${apt.jobId}`);
    console.log(`    Start: ${apt.start}`);
    console.log(`    End: ${apt.end}`);
    console.log(`    Status: ${apt.status}`);
    console.log(`    Arrival Window: ${apt.arrivalWindowStart} - ${apt.arrivalWindowEnd}`);

    // Get the job to find technician
    const job = await stFetch(`/jpm/v2/tenant/${ST_CONFIG.tenantId}/jobs/${apt.jobId}`);
    console.log(`    Job Status: ${job.jobStatus}`);
    console.log(`    Location ID: ${job.locationId}`);
    console.log(`    Technician ID: ${job.technicianId || 'NOT IN JOB'}`);

    // Try to get job appointments for technician info
    const jobAppointments = await stFetch(`/jpm/v2/tenant/${ST_CONFIG.tenantId}/jobs/${apt.jobId}/appointments`);
    console.log(`    Job Appointments:`, jobAppointments.data?.length || 0);
  }

  // Let's also check the dispatch/technician-shifts endpoint
  console.log('\n\n--- Checking Technician Shifts ---');
  const shiftsResult = await stFetch(
    `/dispatch/v2/tenant/${ST_CONFIG.tenantId}/technician-shifts?` +
    `startsOnOrAfter=${startOfDay.toISOString()}&` +
    `startsBefore=${endOfDay.toISOString()}&` +
    `pageSize=50`
  );
  console.log(`Technician Shifts: ${shiftsResult.data?.length || 0}`);
  if (shiftsResult.data?.length > 0) {
    for (const shift of shiftsResult.data.slice(0, 5)) {
      console.log(`  Tech ${shift.technicianId}: ${shift.start} - ${shift.end}`);
    }
  }

  // Check job-assignments endpoint
  console.log('\n\n--- Checking Job Assignments ---');
  const jobAssignmentsResult = await stFetch(
    `/dispatch/v2/tenant/${ST_CONFIG.tenantId}/job-assignments?` +
    `modifiedOnOrAfter=${startOfDay.toISOString()}&` +
    `pageSize=50`
  );
  console.log(`Job Assignments: ${jobAssignmentsResult.data?.length || 0}`);
  if (jobAssignmentsResult.data?.length > 0) {
    for (const ja of jobAssignmentsResult.data.slice(0, 5)) {
      console.log(`  Job ${ja.jobId}: Tech ${ja.technicianId} - ${ja.assignedOn}`);
    }
  }

  console.log('\n' + '='.repeat(60));
}

main().catch(console.error);
