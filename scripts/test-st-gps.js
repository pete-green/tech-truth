/**
 * Test Service Titan GPS/Fleet endpoints
 * Run with: node scripts/test-st-gps.js
 */

require('dotenv').config({ path: '.env.local' });

const ST_AUTH_URL = process.env.ST_AUTH_URL;
const ST_BASE_URL = process.env.ST_BASE_URL;
const ST_CLIENT_ID = process.env.ST_CLIENT_ID;
const ST_CLIENT_SECRET = process.env.ST_CLIENT_SECRET;
const ST_TENANT_ID = process.env.ST_TENANT_ID;
const ST_APPLICATION_KEY = process.env.ST_APPLICATION_KEY;

async function getAccessToken() {
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', ST_CLIENT_ID);
  params.append('client_secret', ST_CLIENT_SECRET);

  const response = await fetch(ST_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await response.json();
  if (!response.ok) throw new Error('Token failed: ' + JSON.stringify(data));
  return data.access_token;
}

async function apiCall(token, endpoint, params = {}) {
  const url = new URL(`${ST_BASE_URL}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) url.searchParams.append(key, value);
  });

  console.log('Calling:', url.pathname + url.search);

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${token}`,
      'ST-App-Key': ST_APPLICATION_KEY,
      'Content-Type': 'application/json',
    },
  });

  const text = await response.text();
  try {
    return { ok: response.ok, status: response.status, data: JSON.parse(text) };
  } catch {
    return { ok: response.ok, status: response.status, data: text };
  }
}

async function main() {
  try {
    const token = await getAccessToken();
    console.log('Got access token\n');

    // Potential GPS/Fleet endpoints to try
    const endpoints = [
      // Fleet/GPS endpoints
      `/dispatch/v2/tenant/${ST_TENANT_ID}/gps`,
      `/dispatch/v2/tenant/${ST_TENANT_ID}/gps-tracking`,
      `/dispatch/v2/tenant/${ST_TENANT_ID}/fleet`,
      `/dispatch/v2/tenant/${ST_TENANT_ID}/vehicles`,
      `/dispatch/v2/tenant/${ST_TENANT_ID}/technician-locations`,
      `/dispatch/v2/tenant/${ST_TENANT_ID}/technician-tracking`,

      // Settings endpoints
      `/settings/v2/tenant/${ST_TENANT_ID}/trucks`,
      `/settings/v2/tenant/${ST_TENANT_ID}/vehicles`,
      `/settings/v2/tenant/${ST_TENANT_ID}/fleet`,

      // Dispatch Pro / optimization
      `/dispatch-pro/v2/tenant/${ST_TENANT_ID}/locations`,

      // Telecom/tracking
      `/telecom/v2/tenant/${ST_TENANT_ID}/gps`,
    ];

    console.log('=== Testing GPS/Fleet Endpoints ===\n');

    for (const endpoint of endpoints) {
      const result = await apiCall(token, endpoint);
      if (result.ok) {
        console.log(`✓ ${result.status} SUCCESS`);
        console.log('  Response:', JSON.stringify(result.data, null, 2).substring(0, 500));
        console.log('');
      } else {
        console.log(`✗ ${result.status}`);
      }
    }

    // Also check if there's any GPS data in the appointment-assignments
    console.log('\n=== Check Appointment Details for GPS ===');

    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
    const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString();

    // Get a recent appointment assignment
    const assignResult = await apiCall(token, `/dispatch/v2/tenant/${ST_TENANT_ID}/appointment-assignments`, {
      startsOnOrAfter: startOfDay,
      startsBefore: endOfDay,
      pageSize: 1
    });

    if (assignResult.ok && assignResult.data.data?.length > 0) {
      const assignment = assignResult.data.data[0];
      console.log('\nAssignment detail:');
      console.log(JSON.stringify(assignment, null, 2));

      // Try to get more details about this assignment
      const detailResult = await apiCall(token, `/dispatch/v2/tenant/${ST_TENANT_ID}/appointment-assignments/${assignment.id}`);
      if (detailResult.ok) {
        console.log('\nDetailed assignment:');
        console.log(JSON.stringify(detailResult.data, null, 2));
      }

      // Get job details
      const jobResult = await apiCall(token, `/jpm/v2/tenant/${ST_TENANT_ID}/jobs/${assignment.jobId}`);
      if (jobResult.ok) {
        console.log('\nJob detail:');
        console.log(JSON.stringify(jobResult.data, null, 2).substring(0, 1500));
      }
    }

  } catch (error) {
    console.error('ERROR:', error.message);
  }
}

main();
