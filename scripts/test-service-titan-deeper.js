/**
 * Deeper exploration of Service Titan API to find technician assignments
 * Run with: node scripts/test-service-titan-deeper.js
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
  if (!response.ok) throw new Error('Failed to get token: ' + JSON.stringify(data));
  return data.access_token;
}

async function apiCall(token, endpoint, params = {}) {
  const url = new URL(`${ST_BASE_URL}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) url.searchParams.append(key, value);
  });

  console.log('   Calling:', url.pathname + url.search);

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${token}`,
      'ST-App-Key': ST_APPLICATION_KEY,
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json();
  return { ok: response.ok, status: response.status, data };
}

async function main() {
  try {
    const token = await getAccessToken();
    console.log('Got access token\n');

    // Get today's appointments
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
    const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString();

    console.log('=== 1. Looking for appointment assignments ===');

    // Try dispatch/appointments endpoint which might have tech assignments
    const dispatchResult = await apiCall(token, `/dispatch/v2/tenant/${ST_TENANT_ID}/appointment-assignments`, {
      startsOnOrAfter: startOfDay,
      startsBefore: endOfDay,
      pageSize: 5
    });

    if (dispatchResult.ok) {
      console.log('\n   Dispatch appointment assignments found!');
      const assignments = dispatchResult.data.data || dispatchResult.data;
      if (Array.isArray(assignments) && assignments.length > 0) {
        console.log('   Sample:', JSON.stringify(assignments[0], null, 2));
        console.log('\n   Fields:', Object.keys(assignments[0]).join(', '));
      } else {
        console.log('   Response:', JSON.stringify(dispatchResult.data, null, 2));
      }
    } else {
      console.log('   Error:', dispatchResult.status, JSON.stringify(dispatchResult.data));
    }

    console.log('\n=== 2. Try job/appointments with technicians ===');

    // Get a specific appointment and look for technician info
    const aptResult = await apiCall(token, `/jpm/v2/tenant/${ST_TENANT_ID}/appointments`, {
      startsOnOrAfter: startOfDay,
      startsBefore: endOfDay,
      pageSize: 3
    });

    if (aptResult.ok) {
      const apts = aptResult.data.data || [];
      if (apts.length > 0) {
        const aptId = apts[0].id;
        console.log(`\n   Fetching appointment ${aptId} details...`);

        // Try to get appointment with assignments
        const aptDetailResult = await apiCall(token, `/jpm/v2/tenant/${ST_TENANT_ID}/appointments/${aptId}`);
        if (aptDetailResult.ok) {
          console.log('   Appointment detail:', JSON.stringify(aptDetailResult.data, null, 2));
        }
      }
    }

    console.log('\n=== 3. Try dispatch board endpoint ===');
    const boardResult = await apiCall(token, `/dispatch/v2/tenant/${ST_TENANT_ID}/appointments`, {
      startsOnOrAfter: startOfDay,
      startsBefore: endOfDay,
      pageSize: 3
    });

    if (boardResult.ok) {
      const boardApts = boardResult.data.data || boardResult.data;
      if (Array.isArray(boardApts) && boardApts.length > 0) {
        console.log('   Dispatch appointments found!');
        console.log('   Sample:', JSON.stringify(boardApts[0], null, 2));
        console.log('\n   Fields:', Object.keys(boardApts[0]).join(', '));
      } else {
        console.log('   Response:', JSON.stringify(boardResult.data, null, 2));
      }
    } else {
      console.log('   Error:', boardResult.status, JSON.stringify(boardResult.data));
    }

    console.log('\n=== 4. Check technician shifts ===');
    const shiftsResult = await apiCall(token, `/dispatch/v2/tenant/${ST_TENANT_ID}/technician-shifts`, {
      startsOnOrAfter: startOfDay,
      startsBefore: endOfDay,
      pageSize: 5
    });

    if (shiftsResult.ok) {
      const shifts = shiftsResult.data.data || shiftsResult.data;
      if (Array.isArray(shifts) && shifts.length > 0) {
        console.log('   Technician shifts found!');
        console.log('   Sample:', JSON.stringify(shifts[0], null, 2));
        console.log('\n   Fields:', Object.keys(shifts[0]).join(', '));
      } else {
        console.log('   Response:', JSON.stringify(shiftsResult.data, null, 2));
      }
    } else {
      console.log('   Error:', shiftsResult.status, JSON.stringify(shiftsResult.data));
    }

    console.log('\n=== 5. Check job appointments endpoint (might have techs) ===');
    // Get a job ID first
    const jobsResult = await apiCall(token, `/jpm/v2/tenant/${ST_TENANT_ID}/jobs`, {
      pageSize: 1
    });

    if (jobsResult.ok) {
      const jobs = jobsResult.data.data || [];
      if (jobs.length > 0) {
        const jobId = jobs[0].id;

        // Try job's appointments
        const jobAptsResult = await apiCall(token, `/jpm/v2/tenant/${ST_TENANT_ID}/jobs/${jobId}/appointments`);
        if (jobAptsResult.ok) {
          console.log(`   Job ${jobId} appointments:`, JSON.stringify(jobAptsResult.data, null, 2));
        }
      }
    }

    console.log('\n=== 6. Try CRM endpoint for scheduled events ===');
    const eventsResult = await apiCall(token, `/telecom/v2/tenant/${ST_TENANT_ID}/calls`, {
      createdOnOrAfter: startOfDay,
      pageSize: 3
    });

    if (eventsResult.ok) {
      console.log('   Calls data:', JSON.stringify(eventsResult.data, null, 2).substring(0, 500));
    } else {
      console.log('   Error:', eventsResult.status);
    }

  } catch (error) {
    console.error('ERROR:', error.message);
  }
}

main();
