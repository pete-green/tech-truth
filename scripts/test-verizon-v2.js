/**
 * Test Verizon Connect API with token-based auth
 * Run with: node scripts/test-verizon-v2.js
 */

require('dotenv').config({ path: '.env.local' });

const VERIZON_API_URL = process.env.VERIZON_API_URL;
const VERIZON_USERNAME = process.env.VERIZON_USERNAME;
const VERIZON_PASSWORD = process.env.VERIZON_PASSWORD;

// Extract app ID from username (format: REST_AppName_XXXX@account.com)
const appIdMatch = VERIZON_USERNAME.match(/REST_([^@]+)@/);
const APP_ID = appIdMatch ? appIdMatch[1] : 'CoachingTracking_5113';

console.log('=== Verizon Connect API Test v2 ===\n');
console.log('Config:');
console.log('  API_URL:', VERIZON_API_URL);
console.log('  USERNAME:', VERIZON_USERNAME);
console.log('  APP_ID:', APP_ID);
console.log('');

function getBasicAuth() {
  return `Basic ${Buffer.from(`${VERIZON_USERNAME}:${VERIZON_PASSWORD}`).toString('base64')}`;
}

async function getToken() {
  console.log('=== 1. Getting Token ===');

  const response = await fetch(`${VERIZON_API_URL}/token`, {
    method: 'GET',
    headers: {
      'Authorization': getBasicAuth(),
      'Accept': 'application/json',
    },
  });

  console.log('   Status:', response.status);

  if (!response.ok) {
    const text = await response.text();
    console.log('   Error:', text);
    return null;
  }

  const data = await response.json();
  console.log('   Token response:', JSON.stringify(data, null, 2));
  return data.token || data.Token;
}

async function apiCallWithToken(token, endpoint) {
  console.log(`\n   Calling: ${endpoint}`);

  const response = await fetch(`${VERIZON_API_URL}${endpoint}`, {
    headers: {
      'Authorization': `Atmosphere atmosphere_app_id=${APP_ID}, Bearer ${token}`,
      'Accept': 'application/json',
    },
  });

  console.log('   Status:', response.status);

  const contentType = response.headers.get('content-type');
  let data;
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  return { ok: response.ok, status: response.status, data };
}

async function tryEndpoints(token) {
  // Common Verizon/Fleetmatics endpoints to try
  const endpoints = [
    '/rad/v1/vehicles',
    '/rad/v1/drivers',
    '/rad/v1/locations',
    '/rad/v1/vehicles/locations',
    '/rad/v1/vehicle',
    '/rad/v2/vehicles',
    '/v1/vehicles',
    '/vehicles',
    '/api/v1/vehicles',
    '/fleet/v1/vehicles',
  ];

  for (const endpoint of endpoints) {
    const result = await apiCallWithToken(token, endpoint);

    if (result.ok) {
      console.log('   SUCCESS!');
      const preview = typeof result.data === 'string'
        ? result.data.substring(0, 500)
        : JSON.stringify(result.data, null, 2).substring(0, 1000);
      console.log('   Response preview:', preview);
      return { endpoint, data: result.data };
    } else {
      console.log('   Failed:', typeof result.data === 'string' ? result.data.substring(0, 100) : JSON.stringify(result.data));
    }
  }

  return null;
}

async function main() {
  try {
    // Try getting a token first
    const token = await getToken();

    if (token) {
      console.log('\n=== 2. Testing endpoints with token ===');
      const result = await tryEndpoints(token);

      if (result) {
        console.log('\n=== SUCCESS ===');
        console.log('Working endpoint:', result.endpoint);
      } else {
        console.log('\n=== No working endpoints found ===');
      }
    } else {
      console.log('\nCould not get token, trying direct basic auth...');

      console.log('\n=== 3. Testing with Basic Auth directly ===');
      const endpoints = [
        '/rad/v1/vehicles',
        '/rad/v1/drivers',
        '/v1/vehicles',
      ];

      for (const endpoint of endpoints) {
        console.log(`\n   Calling: ${endpoint}`);
        const response = await fetch(`${VERIZON_API_URL}${endpoint}`, {
          headers: {
            'Authorization': getBasicAuth(),
            'Accept': 'application/json',
          },
        });
        console.log('   Status:', response.status);

        if (response.ok) {
          const data = await response.json();
          console.log('   SUCCESS!', JSON.stringify(data, null, 2).substring(0, 500));
        }
      }
    }
  } catch (error) {
    console.error('\nFATAL ERROR:', error.message);
    console.error(error.stack);
  }
}

main();
