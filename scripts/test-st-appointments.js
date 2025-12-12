// Test Service Titan appointment endpoints to find the right data
// Run with: node scripts/test-st-appointments.js

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
  console.log('SERVICE TITAN APPOINTMENT ENDPOINTS TEST');
  console.log('='.repeat(60));

  // Test different dates
  const dates = [
    { label: 'Yesterday', days: -1 },
    { label: 'Today', days: 0 },
    { label: '2 days ago', days: -2 },
    { label: '5 days ago', days: -5 },
  ];

  for (const { label, days } of dates) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    const dateStr = date.toISOString().split('T')[0];
    const startOfDay = new Date(dateStr + 'T00:00:00Z');
    const endOfDay = new Date(dateStr + 'T23:59:59Z');

    console.log(`\n--- ${label} (${dateStr}) ---`);

    // Test appointment-assignments endpoint
    const assignmentsResult = await stFetch(
      `/dispatch/v2/tenant/${ST_CONFIG.tenantId}/appointment-assignments?` +
      `startsOnOrAfter=${startOfDay.toISOString()}&` +
      `startsBefore=${endOfDay.toISOString()}&` +
      `pageSize=200`
    );
    console.log(`  Appointment Assignments: ${assignmentsResult.data?.length || 0} results`);
    if (assignmentsResult.data?.length > 0) {
      console.log(`    First: Tech ${assignmentsResult.data[0].technicianId}, Job ${assignmentsResult.data[0].jobId}`);
    }

    // Test appointments endpoint (jpm/v2)
    const appointmentsResult = await stFetch(
      `/jpm/v2/tenant/${ST_CONFIG.tenantId}/appointments?` +
      `startsOnOrAfter=${startOfDay.toISOString()}&` +
      `startsBefore=${endOfDay.toISOString()}&` +
      `pageSize=200`
    );
    console.log(`  Appointments (jpm): ${appointmentsResult.data?.length || 0} results`);
    if (appointmentsResult.data?.length > 0) {
      console.log(`    First: Job ${appointmentsResult.data[0].jobId}, Start: ${appointmentsResult.data[0].start}`);
    }
  }

  // Let's also try to find jobs for yesterday in a different way
  console.log('\n--- Checking Jobs directly ---');
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const jobsResult = await stFetch(
    `/jpm/v2/tenant/${ST_CONFIG.tenantId}/jobs?` +
    `modifiedOnOrAfter=${new Date(yesterdayStr + 'T00:00:00Z').toISOString()}&` +
    `pageSize=50`
  );
  console.log(`Jobs modified since yesterday: ${jobsResult.data?.length || 0}`);
  if (jobsResult.data?.length > 0) {
    for (const job of jobsResult.data.slice(0, 5)) {
      console.log(`  Job ${job.id}: ${job.jobNumber} - ${job.jobStatus}`);
    }
  }

  // Try getting a single appointment assignment for inspection
  console.log('\n--- Raw Appointment Assignment Response (yesterday) ---');
  const rawResult = await stFetch(
    `/dispatch/v2/tenant/${ST_CONFIG.tenantId}/appointment-assignments?` +
    `startsOnOrAfter=${new Date(yesterdayStr + 'T00:00:00Z').toISOString()}&` +
    `startsBefore=${new Date(yesterdayStr + 'T23:59:59Z').toISOString()}&` +
    `pageSize=5`
  );
  console.log(JSON.stringify(rawResult, null, 2));

  console.log('\n' + '='.repeat(60));
}

main().catch(console.error);
