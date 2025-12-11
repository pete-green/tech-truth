/**
 * Test Verizon Connect API - fixed token handling
 * Run with: node scripts/test-verizon-v3.js
 */

require('dotenv').config({ path: '.env.local' });

const VERIZON_API_URL = process.env.VERIZON_API_URL;
const VERIZON_USERNAME = process.env.VERIZON_USERNAME;
const VERIZON_PASSWORD = process.env.VERIZON_PASSWORD;

// Extract app ID from username (format: REST_AppName_XXXX@account.com)
const appIdMatch = VERIZON_USERNAME.match(/REST_([^@]+)@/);
const APP_ID = appIdMatch ? appIdMatch[1] : 'CoachingTracking_5113';

console.log('=== Verizon Connect API Test v3 ===\n');
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

  // Token might be returned as raw text (JWT) or as JSON
  const text = await response.text();
  console.log('   Raw response (first 100 chars):', text.substring(0, 100));

  // Check if it's JSON or raw token
  if (text.startsWith('{')) {
    const data = JSON.parse(text);
    console.log('   JSON token response');
    return data.token || data.Token;
  } else {
    // It's a raw JWT
    console.log('   Raw JWT token received');
    return text;
  }
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
  const text = await response.text();

  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  } else {
    data = text;
  }

  return { ok: response.ok, status: response.status, data };
}

async function testEndpoints(token) {
  console.log('\n=== 2. Testing Vehicle Endpoints ===');

  // Try different vehicle endpoints
  const vehicleEndpoints = [
    '/rad/v1/vehicles',
    '/rad/v2/vehicles',
  ];

  for (const endpoint of vehicleEndpoints) {
    const result = await apiCallWithToken(token, endpoint);

    if (result.ok) {
      console.log('   SUCCESS!');

      const vehicles = Array.isArray(result.data) ? result.data : (result.data.Vehicle || result.data.vehicles || [result.data]);
      console.log('   Found', vehicles.length, 'vehicles');

      if (vehicles.length > 0) {
        console.log('\n   Sample vehicle:');
        console.log(JSON.stringify(vehicles[0], null, 2));
        console.log('\n   All vehicle fields:', Object.keys(vehicles[0]).join(', '));

        // Print all vehicles with their IDs
        console.log('\n   All vehicles:');
        vehicles.forEach((v, i) => {
          const id = v.VehicleId || v.vehicleId || v.Id || v.id;
          const name = v.VehicleName || v.vehicleName || v.Name || v.name;
          const driver = v.DriverName || v.driverName || v.Driver || 'N/A';
          console.log(`   ${i + 1}. ID: ${id}, Name: ${name}, Driver: ${driver}`);
        });
      }

      return vehicles;
    } else {
      console.log('   Failed:', typeof result.data === 'string' ? result.data.substring(0, 200) : JSON.stringify(result.data));
    }
  }

  return [];
}

async function testDriverEndpoints(token) {
  console.log('\n=== 3. Testing Driver Endpoints ===');

  const driverEndpoints = [
    '/rad/v1/drivers',
    '/rad/v2/drivers',
  ];

  for (const endpoint of driverEndpoints) {
    const result = await apiCallWithToken(token, endpoint);

    if (result.ok) {
      console.log('   SUCCESS!');

      const drivers = Array.isArray(result.data) ? result.data : (result.data.Driver || result.data.drivers || [result.data]);
      console.log('   Found', drivers.length, 'drivers');

      if (drivers.length > 0) {
        console.log('\n   Sample driver:');
        console.log(JSON.stringify(drivers[0], null, 2));
        console.log('\n   All driver fields:', Object.keys(drivers[0]).join(', '));
      }

      return drivers;
    } else {
      console.log('   Failed:', typeof result.data === 'string' ? result.data.substring(0, 200) : JSON.stringify(result.data));
    }
  }

  return [];
}

async function testLocationEndpoints(token, vehicleId) {
  console.log('\n=== 4. Testing Location Endpoints ===');

  const locationEndpoints = [
    '/rad/v1/vehicles/locations',
    '/rad/v1/vehicles/location',
    `/rad/v1/vehicles/${vehicleId}/location`,
    `/rad/v1/vehicles/${vehicleId}/locations`,
  ];

  for (const endpoint of locationEndpoints) {
    const result = await apiCallWithToken(token, endpoint);

    if (result.ok) {
      console.log('   SUCCESS!');
      console.log('   Response:', JSON.stringify(result.data, null, 2).substring(0, 1000));
      return result.data;
    } else {
      console.log('   Failed:', typeof result.data === 'string' ? result.data.substring(0, 100) : JSON.stringify(result.data));
    }
  }

  return null;
}

async function main() {
  try {
    const token = await getToken();

    if (!token) {
      console.log('Failed to get token!');
      return;
    }

    console.log('\n   Token (first 50 chars):', token.substring(0, 50) + '...');

    const vehicles = await testEndpoints(token);
    await testDriverEndpoints(token);

    if (vehicles.length > 0) {
      const vehicleId = vehicles[0].VehicleId || vehicles[0].vehicleId || vehicles[0].Id;
      if (vehicleId) {
        await testLocationEndpoints(token, vehicleId);
      }
    }

  } catch (error) {
    console.error('\nFATAL ERROR:', error.message);
    console.error(error.stack);
  }
}

main();
