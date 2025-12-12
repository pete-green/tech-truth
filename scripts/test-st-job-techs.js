// Find how to get technician assigned to each job
// Run with: node scripts/test-st-job-techs.js

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
  const url = `https://api.servicetitan.io${endpoint}`;
  const res = await fetch(url, {
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
  console.log('FINDING TECHNICIAN ASSIGNMENTS');
  console.log('='.repeat(60));

  // Get a single job from yesterday
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split('T')[0];
  const startOfDay = new Date(dateStr + 'T00:00:00Z');
  const endOfDay = new Date(dateStr + 'T23:59:59Z');

  // Get one appointment
  const aptsResult = await stFetch(
    `/jpm/v2/tenant/${ST_CONFIG.tenantId}/appointments?` +
    `startsOnOrAfter=${startOfDay.toISOString()}&` +
    `startsBefore=${endOfDay.toISOString()}&` +
    `pageSize=1`
  );

  const apt = aptsResult.data[0];
  console.log(`\nTest appointment: ${apt.id}, Job: ${apt.jobId}`);
  console.log(`Appointment start: ${apt.start}`);

  // Get full job details
  const job = await stFetch(`/jpm/v2/tenant/${ST_CONFIG.tenantId}/jobs/${apt.jobId}`);
  console.log('\nFull job object keys:', Object.keys(job));
  console.log('\nJob details:');
  console.log(JSON.stringify(job, null, 2));

  // Try different approaches to find tech:
  console.log('\n\n--- Approach 1: Check appointment-assignments by appointmentId ---');
  const aptAssignments = await stFetch(
    `/dispatch/v2/tenant/${ST_CONFIG.tenantId}/appointment-assignments?` +
    `ids=${apt.id}`
  );
  console.log('By appointment ID:', JSON.stringify(aptAssignments.data, null, 2));

  console.log('\n\n--- Approach 2: Check appointment-assignments by jobId ---');
  const jobAssignments = await stFetch(
    `/dispatch/v2/tenant/${ST_CONFIG.tenantId}/appointment-assignments?` +
    `jobId=${apt.jobId}`
  );
  console.log('By job ID:', JSON.stringify(jobAssignments.data, null, 2));

  console.log('\n\n--- Approach 3: Get completed jobs with technicians ---');
  const completedJobs = await stFetch(
    `/jpm/v2/tenant/${ST_CONFIG.tenantId}/jobs?` +
    `completedOnOrAfter=${startOfDay.toISOString()}&` +
    `completedBefore=${endOfDay.toISOString()}&` +
    `pageSize=5`
  );
  console.log(`Found ${completedJobs.data?.length || 0} completed jobs`);
  if (completedJobs.data?.length > 0) {
    console.log('First completed job:', JSON.stringify(completedJobs.data[0], null, 2));
  }

  // Try appointments endpoint
  console.log('\n\n--- Approach 4: Check job history ---');
  const jobHistory = await stFetch(
    `/jpm/v2/tenant/${ST_CONFIG.tenantId}/jobs/${apt.jobId}/history`
  );
  console.log('Job history:', JSON.stringify(jobHistory, null, 2));

  console.log('\n' + '='.repeat(60));
}

main().catch(console.error);
