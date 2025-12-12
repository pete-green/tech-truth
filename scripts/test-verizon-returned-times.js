// Analyze Verizon returned timestamps
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

async function main() {
  const token = await getToken();

  // Get current location which shows both timestamp formats
  const res = await fetch(
    `${VERIZON_CONFIG.apiUrl}/rad/v1/vehicles/2018/location`,
    {
      headers: { Authorization: `Atmosphere atmosphere_app_id=${VERIZON_CONFIG.appId}, Bearer ${token}` },
    }
  );
  const loc = await res.json();

  console.log('Current location response:');
  console.log(`  UpdateUTC field: ${loc.UpdateUTC}`);
  console.log();

  // Parse the timestamp different ways
  const rawTimestamp = '2025-12-10T12:30:03'; // Example from history

  console.log('Parsing "2025-12-10T12:30:03":');
  console.log(`  As-is (local): ${new Date(rawTimestamp)}`);
  console.log(`  With Z added: ${new Date(rawTimestamp + 'Z')}`);
  console.log();

  // The key question: does the returned data match what we requested?
  // We requested UTC 12:30 to 15:00 and got data from "12:30:03"
  // If Verizon stores/returns in UTC, then 12:30:03 UTC = 7:30:03 AM EST
  // That would be correct for what we requested!

  console.log('If Verizon returns times in UTC:');
  console.log(`  "2025-12-10T12:30:03" = ${new Date('2025-12-10T12:30:03Z').toLocaleString('en-US', { timeZone: 'America/New_York' })} EST`);

  console.log('\nIf Verizon returns times in local:');
  console.log(`  "2025-12-10T12:30:03" = ${new Date('2025-12-10T12:30:03').toLocaleString('en-US', { timeZone: 'America/New_York' })} EST`);

  // Let's verify by checking if our EST 8:00 AM job aligns
  // Job scheduled at 8:00 AM EST = 13:00 UTC
  // The tech should have arrived around 8:00 AM EST
  // If GPS shows arrival at "13:10" and that's UTC, it means 8:10 AM EST - reasonable!
  // If GPS shows arrival at "13:10" and that's local EST, it means 1:10 PM EST - 5 hours late? unlikely

  console.log('\nAnalyzing arrival time from earlier test:');
  console.log('  GPS showed "arrival" at "2025-12-10T13:09:55"');
  console.log(`  If UTC: ${new Date('2025-12-10T13:09:55Z').toLocaleString('en-US', { timeZone: 'America/New_York' })} EST`);
  console.log(`  If local: ${new Date('2025-12-10T13:09:55').toLocaleString('en-US', { timeZone: 'America/New_York' })} EST`);
  console.log('  Job scheduled for 8:00 AM EST (13:00 UTC)');
  console.log('  If UTC interpretation: ~10 minutes late - REASONABLE');
  console.log('  If local interpretation: ~5 hours late - UNLIKELY');
}

main().catch(console.error);
