// Quick Verizon/Fleetmatics API test - using correct endpoints
require('dotenv').config({ path: '.env.local' });

const VERIZON_CONFIG = {
  apiUrl: process.env.VERIZON_API_URL || 'https://fim.api.us.fleetmatics.com',
  username: process.env.VERIZON_USERNAME,
  password: process.env.VERIZON_PASSWORD,
  appId: 'fleetmatics-p-us-IsVqHeP2nslCQYVYMBTpbPiFW6udcPl14dw5GAbA',
};

function getBasicAuthHeader() {
  const credentials = `${VERIZON_CONFIG.username}:${VERIZON_CONFIG.password}`;
  return `Basic ${Buffer.from(credentials).toString('base64')}`;
}

async function main() {
  console.log('Testing Verizon/Fleetmatics API...');
  console.log('API URL:', VERIZON_CONFIG.apiUrl);
  console.log('Username:', VERIZON_CONFIG.username);

  // Get token
  console.log('\n1. Getting token...');
  const tokenRes = await fetch(`${VERIZON_CONFIG.apiUrl}/token`, {
    method: 'GET',
    headers: {
      Authorization: getBasicAuthHeader(),
      Accept: 'application/json',
    },
  });

  console.log('Token status:', tokenRes.status);

  if (!tokenRes.ok) {
    console.log('Token error:', await tokenRes.text());
    return;
  }

  const tokenText = await tokenRes.text();
  const token = tokenText.startsWith('{') ? JSON.parse(tokenText).token : tokenText;
  console.log('Token obtained:', token.substring(0, 30) + '...');

  // Test current location
  console.log('\n2. Testing current location for vehicle 2129...');
  const locRes = await fetch(`${VERIZON_CONFIG.apiUrl}/rad/v1/vehicles/2129/location`, {
    headers: {
      Authorization: `Atmosphere atmosphere_app_id=${VERIZON_CONFIG.appId}, Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  console.log('Location status:', locRes.status);
  if (locRes.ok) {
    const locData = await locRes.json();
    console.log('Location:', JSON.stringify(locData, null, 2));
  } else {
    console.log('Location error:', await locRes.text());
  }

  // Test history for yesterday
  console.log('\n3. Testing GPS history for yesterday 8-10 AM...');
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(8, 0, 0, 0);
  const startTime = yesterday.toISOString();
  yesterday.setHours(10, 0, 0, 0);
  const endTime = yesterday.toISOString();

  console.log(`Time window: ${startTime} to ${endTime}`);

  const histRes = await fetch(
    `${VERIZON_CONFIG.apiUrl}/rad/v1/vehicles/2129/status/history?startdatetimeutc=${startTime}&enddatetimeutc=${endTime}`,
    {
      headers: {
        Authorization: `Atmosphere atmosphere_app_id=${VERIZON_CONFIG.appId}, Bearer ${token}`,
        Accept: 'application/json',
      },
    }
  );

  console.log('History status:', histRes.status);

  if (histRes.ok) {
    const histData = await histRes.json();
    console.log('History points:', Array.isArray(histData) ? histData.length : 'Not an array');
    if (Array.isArray(histData) && histData.length > 0) {
      console.log('First point:', JSON.stringify(histData[0], null, 2));
    }
  } else {
    console.log('History error:', await histRes.text());
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  if (err.cause) {
    console.error('Cause:', err.cause.message);
  }
});
