// Check if Rob's vehicle exists in Verizon and has GPS data
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
  const vehicleId = '2233';

  console.log('Checking vehicle ' + vehicleId + ' in Verizon...\n');

  // Try to get vehicle info
  try {
    const vehicle = await verizonFetch('/rad/v1/vehicles/' + vehicleId);
    console.log('=== VEHICLE INFO ===');
    console.log(JSON.stringify(vehicle, null, 2));
  } catch (e) {
    console.log('Could not get vehicle info:', e.message);
  }

  // Try to get current location
  try {
    const location = await verizonFetch('/rad/v1/vehicles/' + vehicleId + '/location');
    console.log('\n=== CURRENT LOCATION ===');
    console.log(JSON.stringify(location, null, 2));
  } catch (e) {
    console.log('\nCould not get current location:', e.message);
  }

  // Try to get segments for today
  try {
    const today = new Date().toISOString().split('T')[0] + 'T00:00:00Z';
    const segments = await verizonFetch('/rad/v1/vehicles/' + vehicleId + '/segments?startdateutc=' + today);
    console.log('\n=== TODAY SEGMENTS ===');
    if (Array.isArray(segments) && segments.length > 0) {
      console.log('Segments found:', segments[0].Segments?.length || 0);
      if (segments[0].Segments?.length > 0) {
        console.log('First segment:', JSON.stringify(segments[0].Segments[0], null, 2));
      }
    } else {
      console.log('No segments data');
    }
  } catch (e) {
    console.log('\nCould not get segments:', e.message);
  }

  // List all vehicles to see what's available
  console.log('\n=== ALL VEHICLES (looking for Rob) ===');
  try {
    const vehicles = await verizonFetch('/rad/v1/vehicles');
    for (const v of vehicles) {
      // Check if the vehicle name might be Rob's
      if (v.Name && (v.Name.toLowerCase().includes('rob') ||
                     v.Name.toLowerCase().includes('lorraine') ||
                     v.Name.toLowerCase().includes('2233'))) {
        console.log('Possible match: ' + v.Number + ' - ' + v.Name);
      }
    }

    // Also show vehicles numbered close to 2233
    console.log('\nVehicles with numbers near 2233:');
    for (const v of vehicles) {
      const num = parseInt(v.Number);
      if (num >= 2200 && num <= 2300) {
        console.log('  ' + v.Number + ' - ' + v.Name);
      }
    }
  } catch (e) {
    console.log('Could not list vehicles:', e.message);
  }
}

main().catch(console.error);
