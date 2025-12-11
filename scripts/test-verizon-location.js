/**
 * Test Verizon Connect API - Single Vehicle Location Endpoint
 * This uses the working endpoint pattern from the Warehouse Operations project
 * Run with: node scripts/test-verizon-location.js
 */

require('dotenv').config({ path: '.env.local' });

const VERIZON_API_URL = process.env.VERIZON_API_URL || 'https://fim.api.us.fleetmatics.com';
const VERIZON_USERNAME = process.env.VERIZON_USERNAME;
const VERIZON_PASSWORD = process.env.VERIZON_PASSWORD;

// The APP_ID from the working Edge Function
const VERIZON_APP_ID = 'fleetmatics-p-us-IsVqHeP2nslCQYVYMBTpbPiFW6udcPl14dw5GAbA';

console.log('=== Verizon Connect API - Vehicle Location Test ===\n');
console.log('Config:');
console.log('  API_URL:', VERIZON_API_URL);
console.log('  USERNAME:', VERIZON_USERNAME);
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

  const token = await response.text();
  console.log('   Token received (first 50 chars):', token.substring(0, 50) + '...');
  return token;
}

async function getVehicleLocation(token, vehicleNumber) {
  console.log(`\n   Getting location for vehicle: ${vehicleNumber}`);

  const response = await fetch(
    `${VERIZON_API_URL}/rad/v1/vehicles/${vehicleNumber}/location`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Atmosphere atmosphere_app_id=${VERIZON_APP_ID}, Bearer ${token}`,
        'Accept': 'application/json',
      },
    }
  );

  console.log('   Status:', response.status);

  if (!response.ok) {
    const text = await response.text();
    console.log('   Error:', text);
    return null;
  }

  return await response.json();
}

function formatAddress(addr) {
  if (!addr) return null;
  const parts = [
    addr.AddressLine1,
    addr.Locality,
    addr.AdministrativeArea,
    addr.PostalCode
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

async function main() {
  try {
    // Step 1: Get token
    const token = await getToken();
    if (!token) {
      console.log('Failed to get token!');
      return;
    }

    // Step 2: Test with known vehicle numbers from the Warehouse Operations database
    // These are actual truck numbers that have GPS tracking
    const testVehicleNumbers = ['2021', '1501', '2124', '7109', '2134'];

    console.log('\n=== 2. Testing Vehicle Location Endpoints ===');
    console.log(`   Testing ${testVehicleNumbers.length} known vehicle numbers...\n`);

    const results = [];
    for (const vehicleNumber of testVehicleNumbers) {
      const location = await getVehicleLocation(token, vehicleNumber);

      if (location) {
        console.log('   ✓ SUCCESS!');
        console.log('   Location data:');
        console.log(`     - Latitude: ${location.Latitude}`);
        console.log(`     - Longitude: ${location.Longitude}`);
        console.log(`     - Address: ${formatAddress(location.Address)}`);
        console.log(`     - Speed: ${location.Speed} mph`);
        console.log(`     - Heading: ${location.Heading} (${location.Direction}°)`);
        console.log(`     - DisplayState: ${location.DisplayState}`);
        console.log(`     - UpdateUTC: ${location.UpdateUTC}`);

        results.push({
          vehicleNumber,
          success: true,
          data: location
        });
      } else {
        results.push({
          vehicleNumber,
          success: false
        });
      }
    }

    // Summary
    console.log('\n=== Summary ===');
    const successes = results.filter(r => r.success);
    console.log(`Successful: ${successes.length}/${results.length}`);

    if (successes.length > 0) {
      console.log('\nSample raw response (first success):');
      console.log(JSON.stringify(successes[0].data, null, 2));
    }

    // Print all fields available in the response
    if (successes.length > 0) {
      console.log('\nAll fields in location response:');
      console.log(Object.keys(successes[0].data).join(', '));
    }

  } catch (error) {
    console.error('\nFATAL ERROR:', error.message);
    console.error(error.stack);
  }
}

main();
