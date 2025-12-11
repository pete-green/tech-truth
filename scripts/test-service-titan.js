/**
 * Test script to explore Service Titan API responses
 * Run with: node scripts/test-service-titan.js
 */

require('dotenv').config({ path: '.env.local' });

const ST_AUTH_URL = process.env.ST_AUTH_URL;
const ST_BASE_URL = process.env.ST_BASE_URL;
const ST_CLIENT_ID = process.env.ST_CLIENT_ID;
const ST_CLIENT_SECRET = process.env.ST_CLIENT_SECRET;
const ST_TENANT_ID = process.env.ST_TENANT_ID;
const ST_APPLICATION_KEY = process.env.ST_APPLICATION_KEY;

console.log('=== Service Titan API Test ===\n');
console.log('Config:');
console.log('  AUTH_URL:', ST_AUTH_URL);
console.log('  BASE_URL:', ST_BASE_URL);
console.log('  TENANT_ID:', ST_TENANT_ID);
console.log('  CLIENT_ID:', ST_CLIENT_ID ? ST_CLIENT_ID.substring(0, 10) + '...' : 'NOT SET');
console.log('  CLIENT_SECRET:', ST_CLIENT_SECRET ? '***' : 'NOT SET');
console.log('  APP_KEY:', ST_APPLICATION_KEY ? ST_APPLICATION_KEY.substring(0, 10) + '...' : 'NOT SET');
console.log('');

async function getAccessToken() {
  console.log('1. Getting access token...');

  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', ST_CLIENT_ID);
  params.append('client_secret', ST_CLIENT_SECRET);

  const response = await fetch(ST_AUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const data = await response.json();

  if (!response.ok) {
    console.log('   ERROR:', JSON.stringify(data, null, 2));
    throw new Error('Failed to get access token');
  }

  console.log('   SUCCESS - Token type:', data.token_type);
  console.log('   Expires in:', data.expires_in, 'seconds');
  return data.access_token;
}

async function apiCall(token, endpoint, params = {}) {
  const url = new URL(`${ST_BASE_URL}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) url.searchParams.append(key, value);
  });

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

async function testTechnicians(token) {
  console.log('\n2. Getting technicians...');

  const result = await apiCall(token, `/settings/v2/tenant/${ST_TENANT_ID}/technicians`, {
    pageSize: 10,
    active: 'True'
  });

  if (!result.ok) {
    console.log('   ERROR:', result.status, JSON.stringify(result.data, null, 2));
    return [];
  }

  const technicians = result.data.data || result.data;
  console.log('   Found', Array.isArray(technicians) ? technicians.length : 'unknown', 'technicians');

  if (Array.isArray(technicians) && technicians.length > 0) {
    console.log('\n   Sample technician (first one):');
    console.log(JSON.stringify(technicians[0], null, 2));

    console.log('\n   All technician fields available:');
    console.log('  ', Object.keys(technicians[0]).join(', '));
  }

  return technicians;
}

async function testAppointments(token) {
  console.log('\n3. Getting appointments for today...');

  const today = new Date();
  const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
  const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString();

  console.log('   Date range:', startOfDay, 'to', endOfDay);

  const result = await apiCall(token, `/jpm/v2/tenant/${ST_TENANT_ID}/appointments`, {
    pageSize: 10,
    startsOnOrAfter: startOfDay,
    startsBefore: endOfDay
  });

  if (!result.ok) {
    console.log('   ERROR:', result.status, JSON.stringify(result.data, null, 2));
    return [];
  }

  const appointments = result.data.data || result.data;
  console.log('   Found', Array.isArray(appointments) ? appointments.length : 'unknown', 'appointments');

  if (Array.isArray(appointments) && appointments.length > 0) {
    console.log('\n   Sample appointment (first one):');
    console.log(JSON.stringify(appointments[0], null, 2));

    console.log('\n   All appointment fields available:');
    console.log('  ', Object.keys(appointments[0]).join(', '));
  }

  return appointments;
}

async function testJobs(token) {
  console.log('\n4. Getting jobs...');

  const today = new Date();
  const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
  const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString();

  const result = await apiCall(token, `/jpm/v2/tenant/${ST_TENANT_ID}/jobs`, {
    pageSize: 10,
    createdOnOrAfter: startOfDay
  });

  if (!result.ok) {
    console.log('   ERROR:', result.status, JSON.stringify(result.data, null, 2));
    return [];
  }

  const jobs = result.data.data || result.data;
  console.log('   Found', Array.isArray(jobs) ? jobs.length : 'unknown', 'jobs');

  if (Array.isArray(jobs) && jobs.length > 0) {
    console.log('\n   Sample job (first one):');
    console.log(JSON.stringify(jobs[0], null, 2));

    console.log('\n   All job fields available:');
    console.log('  ', Object.keys(jobs[0]).join(', '));
  }

  return jobs;
}

async function testJobDetails(token, jobId) {
  console.log(`\n5. Getting job details for job ${jobId}...`);

  const result = await apiCall(token, `/jpm/v2/tenant/${ST_TENANT_ID}/jobs/${jobId}`);

  if (!result.ok) {
    console.log('   ERROR:', result.status, JSON.stringify(result.data, null, 2));
    return null;
  }

  console.log('\n   Full job details:');
  console.log(JSON.stringify(result.data, null, 2));

  return result.data;
}

async function main() {
  try {
    const token = await getAccessToken();

    const technicians = await testTechnicians(token);
    const appointments = await testAppointments(token);
    const jobs = await testJobs(token);

    // If we got jobs, get details on the first one
    if (jobs.length > 0) {
      await testJobDetails(token, jobs[0].id);
    }

    console.log('\n=== Summary ===');
    console.log('Technicians:', technicians.length);
    console.log('Appointments today:', appointments.length);
    console.log('Jobs:', jobs.length);

  } catch (error) {
    console.error('\nFATAL ERROR:', error.message);
  }
}

main();
