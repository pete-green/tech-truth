// Test GPS history with proper time ranges
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

async function getToken() {
  const res = await fetch(`${VERIZON_CONFIG.apiUrl}/token`, {
    method: 'GET',
    headers: {
      Authorization: getBasicAuthHeader(),
      Accept: 'application/json',
    },
  });
  const text = await res.text();
  return text.startsWith('{') ? JSON.parse(text).token : text;
}

async function getHistory(token, vehicleId, startTime, endTime) {
  const res = await fetch(
    `${VERIZON_CONFIG.apiUrl}/rad/v1/vehicles/${vehicleId}/status/history?startdatetimeutc=${startTime}&enddatetimeutc=${endTime}`,
    {
      headers: {
        Authorization: `Atmosphere atmosphere_app_id=${VERIZON_CONFIG.appId}, Bearer ${token}`,
        Accept: 'application/json',
      },
    }
  );
  if (!res.ok) {
    throw new Error(`History failed: ${res.status}`);
  }
  return res.json();
}

async function main() {
  console.log('Testing GPS History with different time ranges...\n');

  const token = await getToken();
  console.log('Token obtained\n');

  const vehicleId = '2129'; // Mitch C's truck

  // Test different time ranges for yesterday
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split('T')[0];

  console.log(`Testing vehicle ${vehicleId} for ${dateStr}\n`);

  // Test ranges (using UTC times)
  const ranges = [
    { label: '6 AM - 8 AM EST (11:00-13:00 UTC)', start: '11:00:00.000Z', end: '13:00:00.000Z' },
    { label: '8 AM - 10 AM EST (13:00-15:00 UTC)', start: '13:00:00.000Z', end: '15:00:00.000Z' },
    { label: '10 AM - 12 PM EST (15:00-17:00 UTC)', start: '15:00:00.000Z', end: '17:00:00.000Z' },
    { label: '12 PM - 2 PM EST (17:00-19:00 UTC)', start: '17:00:00.000Z', end: '19:00:00.000Z' },
    { label: '2 PM - 4 PM EST (19:00-21:00 UTC)', start: '19:00:00.000Z', end: '21:00:00.000Z' },
    { label: '4 PM - 6 PM EST (21:00-23:00 UTC)', start: '21:00:00.000Z', end: '23:00:00.000Z' },
  ];

  for (const range of ranges) {
    const startTime = `${dateStr}T${range.start}`;
    const endTime = `${dateStr}T${range.end}`;

    const history = await getHistory(token, vehicleId, startTime, endTime);
    console.log(`${range.label}: ${history.length} points`);

    if (history.length > 0) {
      const first = history[0];
      const last = history[history.length - 1];
      console.log(`  First: ${first.UpdateUtc} at ${first.Address?.AddressLine1 || 'Unknown'}`);
      console.log(`  Last:  ${last.UpdateUtc} at ${last.Address?.AddressLine1 || 'Unknown'}`);
    }
    console.log();
  }

  // Now test the full day
  console.log('Testing full day (6 AM - 6 PM EST)...');
  const fullDayStart = `${dateStr}T11:00:00.000Z`;
  const fullDayEnd = `${dateStr}T23:00:00.000Z`;
  const fullHistory = await getHistory(token, vehicleId, fullDayStart, fullDayEnd);
  console.log(`Full day: ${fullHistory.length} points`);

  if (fullHistory.length > 0) {
    // Group by hour
    const byHour = {};
    for (const point of fullHistory) {
      const hour = new Date(point.UpdateUtc).getUTCHours();
      byHour[hour] = (byHour[hour] || 0) + 1;
    }
    console.log('Points by UTC hour:', byHour);
  }
}

main().catch(console.error);
