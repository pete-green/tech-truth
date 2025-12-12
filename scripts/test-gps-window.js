// Debug GPS window issue
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
    hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
    month: 'short', day: 'numeric'
  });
}

async function main() {
  const token = await getToken();

  // Request window: 7:30 AM to 10:00 AM EST on Dec 10
  // UTC: 12:30 to 15:00 UTC
  const startUtc = '2025-12-10T12:30:00.000Z';  // 7:30 AM EST
  const endUtc = '2025-12-10T15:00:00.000Z';    // 10:00 AM EST

  console.log('Requesting GPS history for vehicle 2018 (Dakota Gentle)');
  console.log(`Start: ${startUtc} (${toEST(startUtc)})`);
  console.log(`End: ${endUtc} (${toEST(endUtc)})`);

  const res = await fetch(
    `${VERIZON_CONFIG.apiUrl}/rad/v1/vehicles/2018/status/history?startdatetimeutc=${startUtc}&enddatetimeutc=${endUtc}`,
    {
      headers: { Authorization: `Atmosphere atmosphere_app_id=${VERIZON_CONFIG.appId}, Bearer ${token}` },
    }
  );
  const history = await res.json();

  console.log(`\nGot ${history.length} points`);

  if (history.length > 0) {
    console.log('\nFirst 5 points:');
    for (const p of history.slice(0, 5)) {
      console.log(`  ${toEST(p.UpdateUtc)} - ${p.Address?.AddressLine1 || 'Unknown'}`);
    }

    console.log('\nLast 5 points:');
    for (const p of history.slice(-5)) {
      console.log(`  ${toEST(p.UpdateUtc)} - ${p.Address?.AddressLine1 || 'Unknown'}`);
    }

    // Check if any points are outside the window
    const startMs = new Date(startUtc).getTime();
    const endMs = new Date(endUtc).getTime();
    const outsideWindow = history.filter(p => {
      const t = new Date(p.UpdateUtc).getTime();
      return t < startMs || t > endMs;
    });

    if (outsideWindow.length > 0) {
      console.log(`\n⚠️ ${outsideWindow.length} points are OUTSIDE the requested window!`);
      console.log('Examples:');
      for (const p of outsideWindow.slice(0, 3)) {
        console.log(`  ${toEST(p.UpdateUtc)} - ${p.Address?.AddressLine1 || 'Unknown'}`);
      }
    } else {
      console.log('\n✅ All points are within the requested window');
    }
  }
}

main().catch(console.error);
