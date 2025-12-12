// List all vehicles from Verizon to find Rob's truck
require('dotenv').config({ path: '.env.local' });

const VERIZON_CONFIG = {
  apiUrl: process.env.VERIZON_API_URL || 'https://fim.api.us.fleetmatics.com',
  username: process.env.VERIZON_USERNAME || '',
  password: process.env.VERIZON_PASSWORD || '',
  appId: 'fleetmatics-p-us-IsVqHeP2nslCQYVYMBTpbPiFW6udcPl14dw5GAbA',
};

let cachedToken = null;

async function getToken() {
  if (cachedToken) return cachedToken;

  const credentials = VERIZON_CONFIG.username + ':' + VERIZON_CONFIG.password;
  const basicAuth = 'Basic ' + Buffer.from(credentials).toString('base64');

  const response = await fetch(VERIZON_CONFIG.apiUrl + '/token', {
    method: 'GET',
    headers: {
      Authorization: basicAuth,
      Accept: 'application/json',
    },
  });

  cachedToken = await response.text();
  return cachedToken;
}

async function verizonFetch(endpoint) {
  const token = await getToken();
  const url = VERIZON_CONFIG.apiUrl + endpoint;

  const response = await fetch(url, {
    headers: {
      Authorization: 'Atmosphere atmosphere_app_id=' + VERIZON_CONFIG.appId + ', Bearer ' + token,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error('Verizon API error ' + response.status + ': ' + text);
  }

  return response.json();
}

async function main() {
  console.log('Fetching all vehicles from Verizon...\n');

  try {
    // Try the vehicles endpoint
    const vehicles = await verizonFetch('/rad/v1/vehicles');

    console.log('Total vehicles found:', vehicles.length);
    console.log('\n=== ALL VEHICLES ===\n');

    // Sort by vehicle number
    vehicles.sort((a, b) => {
      const numA = parseInt(a.Number) || 0;
      const numB = parseInt(b.Number) || 0;
      return numA - numB;
    });

    for (const v of vehicles) {
      console.log(`${v.Number.padStart(6)} - ${v.Name || 'No Name'}`);
    }

    // Look specifically for anything with "rob" or "lorraine" or "2233"
    console.log('\n=== SEARCHING FOR ROB/LORRAINE/2233 ===\n');
    for (const v of vehicles) {
      const name = (v.Name || '').toLowerCase();
      const num = v.Number || '';
      if (name.includes('rob') || name.includes('lorraine') || num.includes('2233')) {
        console.log(`Found: ${num} - ${v.Name}`);

        // Get current location for this vehicle
        try {
          const location = await verizonFetch('/rad/v1/vehicles/' + num + '/location');
          console.log('  Last update:', location.UpdateUTC);
          console.log('  Location:', location.Address?.AddressLine1);
          console.log('  Status:', location.DisplayState);
        } catch (e) {
          console.log('  Could not get location:', e.message);
        }
      }
    }

    // Also list vehicles with numbers close to 2233
    console.log('\n=== VEHICLES NUMBERED 2200-2300 ===\n');
    for (const v of vehicles) {
      const num = parseInt(v.Number);
      if (num >= 2200 && num <= 2300) {
        console.log(`${v.Number} - ${v.Name || 'No Name'}`);

        // Get current location
        try {
          const location = await verizonFetch('/rad/v1/vehicles/' + v.Number + '/location');
          console.log('  Last update:', location.UpdateUTC);
        } catch (e) {
          console.log('  Could not get location');
        }
      }
    }

  } catch (e) {
    console.error('Error:', e.message);

    // If we can't list vehicles, try fetching locations directly
    console.log('\nTrying to fetch locations for vehicles 2230-2240...');
    for (let i = 2230; i <= 2240; i++) {
      try {
        const location = await verizonFetch('/rad/v1/vehicles/' + i + '/location');
        console.log(`Vehicle ${i}: Last update ${location.UpdateUTC}, Status: ${location.DisplayState}`);
      } catch (e) {
        // Vehicle doesn't exist, skip
      }
    }
  }
}

main().catch(console.error);
