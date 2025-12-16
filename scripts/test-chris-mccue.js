// Test Service Titan to check Chris McCue's appointments
// Run with: node scripts/test-chris-mccue.js

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
  const data = await res.json();
  return data;
}

async function main() {
  console.log('='.repeat(60));
  console.log('CHRIS MCCUE APPOINTMENT CHECK');
  console.log('Date: December 15, 2025 (Today)');
  console.log('='.repeat(60));

  // First, find Chris McCue's technician ID
  console.log('\n--- Finding Chris McCue in Service Titan ---');
  const technicians = await stFetch(
    `/settings/v2/tenant/${ST_CONFIG.tenantId}/technicians?active=true&pageSize=200`
  );

  const chrisMccue = technicians.data?.find(t =>
    t.name?.toLowerCase().includes('chris') && t.name?.toLowerCase().includes('mccue')
  );

  if (!chrisMccue) {
    console.log('Chris McCue not found in Service Titan technicians!');
    console.log('All technicians:');
    technicians.data?.forEach(t => console.log(`  - ${t.name} (ID: ${t.id})`));
    return;
  }

  console.log(`Found Chris McCue: ID ${chrisMccue.id}, Name: "${chrisMccue.name}"`);

  // Now check appointments for today
  const today = '2025-12-15';
  const startOfDay = new Date(today + 'T05:00:00Z'); // 00:00 EST = 05:00 UTC
  const endOfDay = new Date(today + 'T04:59:59Z');
  endOfDay.setDate(endOfDay.getDate() + 1); // 23:59 EST = 04:59 UTC next day

  console.log(`\n--- Checking Appointments for Today (EST) ---`);
  console.log(`UTC Range: ${startOfDay.toISOString()} to ${endOfDay.toISOString()}`);

  // Get ALL appointments for today
  const allAppointments = await stFetch(
    `/dispatch/v2/tenant/${ST_CONFIG.tenantId}/appointment-assignments?` +
    `startsOnOrAfter=${startOfDay.toISOString()}&` +
    `startsBefore=${endOfDay.toISOString()}&` +
    `pageSize=200`
  );

  console.log(`\nTotal appointment assignments for today: ${allAppointments.data?.length || 0}`);

  // Filter for Chris McCue
  const chrisAppointments = allAppointments.data?.filter(a => a.technicianId === chrisMccue.id);
  console.log(`Chris McCue's appointments: ${chrisAppointments?.length || 0}`);

  if (chrisAppointments?.length > 0) {
    console.log('\nChris McCue\'s appointments:');
    for (const apt of chrisAppointments) {
      console.log(`  Job ${apt.jobId}: ${apt.start} - ${apt.end}`);
    }
  }

  // Also check using the jpm/v2 appointments endpoint
  console.log('\n--- Also checking JPM appointments endpoint ---');
  const jpmAppointments = await stFetch(
    `/jpm/v2/tenant/${ST_CONFIG.tenantId}/appointments?` +
    `startsOnOrAfter=${startOfDay.toISOString()}&` +
    `startsBefore=${endOfDay.toISOString()}&` +
    `pageSize=200`
  );
  console.log(`Total JPM appointments: ${jpmAppointments.data?.length || 0}`);

  // List all technicians with appointments today
  console.log('\n--- Technicians with appointments today ---');
  const techIds = [...new Set(allAppointments.data?.map(a => a.technicianId) || [])];
  for (const techId of techIds) {
    const tech = technicians.data?.find(t => t.id === techId);
    const count = allAppointments.data?.filter(a => a.technicianId === techId).length;
    console.log(`  ${tech?.name || `Unknown (${techId})`}: ${count} jobs`);
  }

  // Check if Chris has any jobs this week
  console.log('\n--- Checking Chris McCue\'s recent jobs (last 7 days) ---');
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  for (let i = 0; i < 7; i++) {
    const checkDate = new Date(weekAgo);
    checkDate.setDate(checkDate.getDate() + i);
    const dateStr = checkDate.toISOString().split('T')[0];
    const dayStart = new Date(dateStr + 'T05:00:00Z');
    const dayEnd = new Date(dateStr + 'T05:00:00Z');
    dayEnd.setDate(dayEnd.getDate() + 1);

    const dayAppointments = await stFetch(
      `/dispatch/v2/tenant/${ST_CONFIG.tenantId}/appointment-assignments?` +
      `technicianIds=${chrisMccue.id}&` +
      `startsOnOrAfter=${dayStart.toISOString()}&` +
      `startsBefore=${dayEnd.toISOString()}&` +
      `pageSize=50`
    );

    const count = dayAppointments.data?.length || 0;
    if (count > 0) {
      console.log(`  ${dateStr}: ${count} jobs`);
    }
  }

  console.log('\n' + '='.repeat(60));
}

main().catch(console.error);
