// Test what time format Verizon API actually expects
require('dotenv').config({ path: '.env.local' });

const VERIZON_CONFIG = {
  apiUrl: process.env.VERIZON_API_URL || 'https://fim.api.us.fleetmatics.com',
  username: process.env.VERIZON_USERNAME,
  password: process.env.VERIZON_PASSWORD,
  appId: 'fleetmatics-p-us-IsVqHeP2nslCQYVYMBTpbPiFW6udcPl14dw5GAbA',
};

async function getToken() {
  const credentials = `${VERIZON_CONFIG.username}:${VERIZON_CONFIG.password}`;
  const res = await fetch(`${VERIZON_CONFIG.apiUrl}/token`, {
    method: 'GET',
    headers: { Authorization: `Basic ${Buffer.from(credentials).toString('base64')}` },
  });
  const text = await res.text();
  return text.startsWith('{') ? JSON.parse(text).token : text;
}

function toEST(date) {
  return new Date(date).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true
  });
}

async function testWindow(token, vehicleId, startUtc, endUtc, label) {
  console.log(`\n${label}`);
  console.log(`  Request: ${startUtc} to ${endUtc}`);

  const res = await fetch(
    `${VERIZON_CONFIG.apiUrl}/rad/v1/vehicles/${vehicleId}/status/history?startdatetimeutc=${startUtc}&enddatetimeutc=${endUtc}`,
    {
      headers: { Authorization: `Atmosphere atmosphere_app_id=${VERIZON_CONFIG.appId}, Bearer ${token}` },
    }
  );
  const history = await res.json();

  console.log(`  Got ${history.length} points`);
  if (history.length > 0) {
    const first = history[0];
    const last = history[history.length - 1];
    console.log(`  First point: ${first.UpdateUtc} (${toEST(first.UpdateUtc)} EST)`);
    console.log(`  Last point: ${last.UpdateUtc} (${toEST(last.UpdateUtc)} EST)`);
  }
}

async function main() {
  const token = await getToken();
  const vehicleId = '2018';

  console.log('Testing Verizon time formats for vehicle 2018 on Dec 10, 2025');

  // Test 1: What we were doing - using full ISO with Z
  await testWindow(token, vehicleId,
    '2025-12-10T12:30:00.000Z',
    '2025-12-10T15:00:00.000Z',
    'Test 1: Full ISO with Z suffix (7:30-10:00 AM EST as UTC)'
  );

  // Test 2: Try without the Z suffix
  await testWindow(token, vehicleId,
    '2025-12-10T12:30:00',
    '2025-12-10T15:00:00',
    'Test 2: ISO without Z suffix'
  );

  // Test 3: Try with EST times directly (no conversion needed)
  // 7:30 AM EST = what we want
  await testWindow(token, vehicleId,
    '2025-12-10T07:30:00',
    '2025-12-10T10:00:00',
    'Test 3: Direct EST times (7:30-10:00 AM as-is)'
  );

  // Test 4: Try different format
  await testWindow(token, vehicleId,
    '2025-12-10 07:30:00',
    '2025-12-10 10:00:00',
    'Test 4: Space instead of T'
  );

  console.log('\n' + '='.repeat(60));
}

main().catch(console.error);
