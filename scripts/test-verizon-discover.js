/**
 * Discover Verizon Connect API endpoints
 * Run with: node scripts/test-verizon-discover.js
 */

require('dotenv').config({ path: '.env.local' });

const VERIZON_API_URL = process.env.VERIZON_API_URL;
const VERIZON_USERNAME = process.env.VERIZON_USERNAME;
const VERIZON_PASSWORD = process.env.VERIZON_PASSWORD;

const appIdMatch = VERIZON_USERNAME.match(/REST_([^@]+)@/);
const APP_ID = appIdMatch ? appIdMatch[1] : 'CoachingTracking_5113';

console.log('=== Verizon Connect API Discovery ===\n');

function getBasicAuth() {
  return `Basic ${Buffer.from(`${VERIZON_USERNAME}:${VERIZON_PASSWORD}`).toString('base64')}`;
}

async function getToken() {
  const response = await fetch(`${VERIZON_API_URL}/token`, {
    method: 'GET',
    headers: {
      'Authorization': getBasicAuth(),
      'Accept': 'application/json',
    },
  });

  if (!response.ok) return null;
  return await response.text();
}

async function tryEndpoint(token, endpoint, method = 'GET') {
  try {
    const response = await fetch(`${VERIZON_API_URL}${endpoint}`, {
      method,
      headers: {
        'Authorization': `Atmosphere atmosphere_app_id=${APP_ID}, Bearer ${token}`,
        'Accept': 'application/json',
      },
    });

    const text = await response.text();
    return {
      endpoint,
      status: response.status,
      ok: response.ok,
      response: text.substring(0, 300)
    };
  } catch (e) {
    return { endpoint, status: 'error', ok: false, response: e.message };
  }
}

async function main() {
  const token = await getToken();
  if (!token) {
    console.log('Failed to get token!');
    return;
  }
  console.log('Got token!\n');

  // Extensive list of potential Verizon Connect / Fleetmatics / Reveal endpoints
  const endpoints = [
    // Reveal/Fleetmatics style
    '/rad/v1/vehicle',
    '/rad/v1/vehicles',
    '/rad/v1/assets',
    '/rad/v1/fleet',
    '/rad/v1/units',
    '/rad/v1/device',
    '/rad/v1/devices',
    '/rad/v1/driver',
    '/rad/v1/drivers',
    '/rad/v1/location',
    '/rad/v1/locations',
    '/rad/v1/position',
    '/rad/v1/positions',
    '/rad/v1/gps',
    '/rad/v1/tracking',

    // REST API style
    '/rest/v1/vehicles',
    '/rest/v1/drivers',
    '/rest/v1/locations',
    '/api/v1/vehicles',
    '/api/v1/drivers',
    '/api/vehicles',
    '/api/drivers',

    // Resource style
    '/vehicles',
    '/drivers',
    '/locations',
    '/fleet',
    '/assets',

    // Verizon Reveal style
    '/reveal/v1/vehicles',
    '/reveal/v1/drivers',
    '/connect/v1/vehicles',

    // Try with different path patterns
    '/fim/v1/vehicles',
    '/fim/rad/v1/vehicles',
    '/fleetmatics/v1/vehicles',

    // Standard API discovery endpoints
    '/',
    '/api',
    '/v1',
    '/health',
    '/status',
    '/swagger',
    '/docs',
  ];

  console.log('Testing', endpoints.length, 'endpoints...\n');

  const results = [];
  for (const endpoint of endpoints) {
    const result = await tryEndpoint(token, endpoint);
    results.push(result);

    // Show progress
    const statusSymbol = result.ok ? '✓' : (result.status === 404 ? '✗' : '?');
    console.log(`${statusSymbol} ${result.status} ${endpoint}`);

    // If we found something, show more detail
    if (result.ok || (result.status !== 404 && result.status !== 'error')) {
      console.log(`  Response: ${result.response}`);
    }
  }

  console.log('\n=== Summary ===');
  const successes = results.filter(r => r.ok);
  const nonNotFound = results.filter(r => r.status !== 404 && r.status !== 'error');

  console.log('Successful (200):', successes.length);
  console.log('Non-404 responses:', nonNotFound.length);

  if (successes.length > 0) {
    console.log('\nWorking endpoints:');
    successes.forEach(r => console.log(`  ${r.endpoint}: ${r.response.substring(0, 100)}`));
  }

  if (nonNotFound.length > successes.length) {
    console.log('\nOther interesting responses:');
    nonNotFound.filter(r => !r.ok).forEach(r =>
      console.log(`  ${r.status} ${r.endpoint}: ${r.response.substring(0, 100)}`)
    );
  }
}

main();
