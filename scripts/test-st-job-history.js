// Check if Service Titan's "Technician Arrived" event is reliable
// Run with: node scripts/test-st-job-history.js

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
  const res = await fetch(`https://api.servicetitan.io${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'ST-App-Key': ST_CONFIG.appKey,
      'Content-Type': 'application/json',
    },
  });
  return res.json();
}

async function main() {
  console.log('='.repeat(60));
  console.log('SERVICE TITAN JOB HISTORY - ARRIVAL EVENTS');
  console.log('='.repeat(60));

  // Get completed jobs from yesterday
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split('T')[0];
  const startOfDay = new Date(dateStr + 'T00:00:00Z');
  const endOfDay = new Date(dateStr + 'T23:59:59Z');

  console.log(`\nGetting completed jobs for ${dateStr}...`);

  const jobsResult = await stFetch(
    `/jpm/v2/tenant/${ST_CONFIG.tenantId}/jobs?` +
    `completedOnOrAfter=${startOfDay.toISOString()}&` +
    `completedBefore=${endOfDay.toISOString()}&` +
    `pageSize=50`
  );

  const jobs = jobsResult.data || [];
  console.log(`Found ${jobs.length} completed jobs\n`);

  // For each job, get history and look for arrival event
  let jobsWithArrival = 0;
  let jobsWithoutArrival = 0;

  for (const job of jobs.slice(0, 20)) {
    // Get appointment details
    const aptResult = await stFetch(
      `/jpm/v2/tenant/${ST_CONFIG.tenantId}/appointments/${job.firstAppointmentId}`
    );

    // Get job assignment
    const assignmentResult = await stFetch(
      `/dispatch/v2/tenant/${ST_CONFIG.tenantId}/appointment-assignments?` +
      `jobId=${job.id}`
    );
    const assignment = assignmentResult.data?.[0];

    // Get history
    const historyResult = await stFetch(
      `/jpm/v2/tenant/${ST_CONFIG.tenantId}/jobs/${job.id}/history`
    );
    const history = historyResult.history || [];

    // Find arrival event
    const arrivalEvent = history.find(h => h.eventType === 'Technician Arrived');

    console.log(`\nJob ${job.jobNumber}:`);
    console.log(`  Appointment Start: ${aptResult.start}`);
    console.log(`  Technician: ${assignment?.technicianName || 'Unknown'} (ID: ${assignment?.technicianId})`);

    if (arrivalEvent) {
      jobsWithArrival++;
      const scheduledTime = new Date(aptResult.start);
      const arrivalTime = new Date(arrivalEvent.date);
      const varianceMinutes = Math.round((arrivalTime - scheduledTime) / 60000);

      console.log(`  ST Arrival: ${arrivalEvent.date}`);
      console.log(`  Variance: ${varianceMinutes} minutes (${varianceMinutes > 0 ? 'LATE' : 'EARLY/ON-TIME'})`);
    } else {
      jobsWithoutArrival++;
      console.log(`  ST Arrival: NOT RECORDED`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`SUMMARY:`);
  console.log(`  Jobs with arrival event: ${jobsWithArrival}`);
  console.log(`  Jobs without arrival event: ${jobsWithoutArrival}`);
  console.log('='.repeat(60));
}

main().catch(console.error);
