/**
 * Test script to explore Verizon Connect (Fleetmatics) API
 * Run with: node scripts/test-verizon.js
 */

require('dotenv').config({ path: '.env.local' });

const VERIZON_API_URL = process.env.VERIZON_API_URL;
const VERIZON_USERNAME = process.env.VERIZON_USERNAME;
const VERIZON_PASSWORD = process.env.VERIZON_PASSWORD;

console.log('=== Verizon Connect API Test ===\n');
console.log('Config:');
console.log('  API_URL:', VERIZON_API_URL);
console.log('  USERNAME:', VERIZON_USERNAME);
console.log('  PASSWORD:', VERIZON_PASSWORD ? '***' : 'NOT SET');
console.log('');

async function apiCall(endpoint, params = {}) {
  const url = new URL(`${VERIZON_API_URL}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) url.searchParams.append(key, value);
  });

  console.log('   Calling:', endpoint);

  // Verizon uses basic auth
  const auth = Buffer.from(`${VERIZON_USERNAME}:${VERIZON_PASSWORD}`).toString('base64');

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json',
    },
  });

  let data;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  return { ok: response.ok, status: response.status, data };
}

async function main() {
  try {
    console.log('=== 1. Get all vehicles ===');
    const vehiclesResult = await apiCall('/rad/v1/vehicles');

    if (vehiclesResult.ok) {
      const vehicles = Array.isArray(vehiclesResult.data) ? vehiclesResult.data : vehiclesResult.data?.vehicles || [];
      console.log('   Found', vehicles.length, 'vehicles');

      if (vehicles.length > 0) {
        console.log('\n   Sample vehicle (first one):');
        console.log(JSON.stringify(vehicles[0], null, 2));
        console.log('\n   All vehicle fields:');
        console.log('  ', Object.keys(vehicles[0]).join(', '));

        // List all vehicles with their IDs and names
        console.log('\n   All vehicles:');
        vehicles.forEach((v, i) => {
          console.log(`   ${i + 1}. ID: ${v.VehicleId || v.vehicleId || v.id} - Name: ${v.VehicleName || v.vehicleName || v.name || 'N/A'} - Driver: ${v.DriverName || v.driverName || 'N/A'}`);
        });
      }
    } else {
      console.log('   Error:', vehiclesResult.status, vehiclesResult.data);
    }

    console.log('\n=== 2. Get all drivers ===');
    const driversResult = await apiCall('/rad/v1/drivers');

    if (driversResult.ok) {
      const drivers = Array.isArray(driversResult.data) ? driversResult.data : driversResult.data?.drivers || [];
      console.log('   Found', drivers.length, 'drivers');

      if (drivers.length > 0) {
        console.log('\n   Sample driver (first one):');
        console.log(JSON.stringify(drivers[0], null, 2));
        console.log('\n   All driver fields:');
        console.log('  ', Object.keys(drivers[0]).join(', '));

        // List all drivers
        console.log('\n   All drivers:');
        drivers.forEach((d, i) => {
          console.log(`   ${i + 1}. ID: ${d.DriverId || d.driverId || d.id} - Name: ${d.DriverName || d.driverName || d.name || 'N/A'}`);
        });
      }
    } else {
      console.log('   Error:', driversResult.status, driversResult.data);
    }

    console.log('\n=== 3. Get current vehicle locations ===');
    const locationsResult = await apiCall('/rad/v1/vehicles/current-locations');

    if (locationsResult.ok) {
      const locations = Array.isArray(locationsResult.data) ? locationsResult.data : locationsResult.data?.locations || [];
      console.log('   Found', locations.length, 'vehicle locations');

      if (locations.length > 0) {
        console.log('\n   Sample location (first one):');
        console.log(JSON.stringify(locations[0], null, 2));
        console.log('\n   All location fields:');
        console.log('  ', Object.keys(locations[0]).join(', '));
      }
    } else {
      console.log('   Error:', locationsResult.status, locationsResult.data);
    }

    console.log('\n=== 4. Try different location endpoint ===');
    const loc2Result = await apiCall('/rad/v1/location/current');

    if (loc2Result.ok) {
      console.log('   Success:', JSON.stringify(loc2Result.data, null, 2).substring(0, 1000));
    } else {
      console.log('   Error:', loc2Result.status, typeof loc2Result.data === 'string' ? loc2Result.data.substring(0, 200) : loc2Result.data);
    }

    console.log('\n=== 5. Try raw vehicles endpoint ===');
    const raw1 = await apiCall('/v1/vehicles');

    if (raw1.ok) {
      console.log('   Success!');
      const data = Array.isArray(raw1.data) ? raw1.data : [raw1.data];
      if (data.length > 0) console.log('   Sample:', JSON.stringify(data[0], null, 2));
    } else {
      console.log('   Error:', raw1.status);
    }

  } catch (error) {
    console.error('\nFATAL ERROR:', error.message);
    console.error(error.stack);
  }
}

main();
