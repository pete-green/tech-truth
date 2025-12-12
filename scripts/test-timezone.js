// Test timezone handling
require('dotenv').config({ path: '.env.local' });

const ST_CONFIG = {
  clientId: process.env.ST_CLIENT_ID,
  clientSecret: process.env.ST_CLIENT_SECRET,
  tenantId: process.env.ST_TENANT_ID,
  appKey: process.env.ST_APPLICATION_KEY,
};

let stToken = null;

async function getSTToken() {
  if (stToken) return stToken;
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: ST_CONFIG.clientId,
    client_secret: ST_CONFIG.clientSecret,
  });
  const res = await fetch('https://auth.servicetitan.io/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await res.json();
  stToken = data.access_token;
  return stToken;
}

async function stFetch(endpoint) {
  const token = await getSTToken();
  const res = await fetch(`https://api.servicetitan.io${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'ST-App-Key': ST_CONFIG.appKey,
      'Content-Type': 'application/json',
    },
  });
  return res.json();
}

async function main() {
  console.log('Testing Service Titan appointment times...\n');

  // Get yesterday's appointments
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split('T')[0];

  const aptsResult = await stFetch(
    `/jpm/v2/tenant/${ST_CONFIG.tenantId}/appointments?` +
    `startsOnOrAfter=${dateStr}T00:00:00Z&` +
    `startsBefore=${dateStr}T23:59:59Z&` +
    `pageSize=10`
  );

  const appointments = aptsResult.data || [];
  console.log(`Found ${appointments.length} appointments\n`);

  for (const apt of appointments.slice(0, 5)) {
    console.log(`Appointment ${apt.id}:`);
    console.log(`  Raw start: ${apt.start}`);
    console.log(`  As Date object: ${new Date(apt.start)}`);
    console.log(`  UTC: ${new Date(apt.start).toUTCString()}`);
    console.log(`  Local (EST): ${new Date(apt.start).toLocaleString('en-US', { timeZone: 'America/New_York' })}`);
    console.log();
  }
}

main().catch(console.error);
