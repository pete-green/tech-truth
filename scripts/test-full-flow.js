/**
 * Full Flow Test - Service Titan + Verizon Connect Integration
 * This script tests the complete data flow for Tech Truth:
 * 1. Get technicians from Service Titan
 * 2. Get today's appointments from Service Titan
 * 3. Get technician-appointment assignments from Service Titan
 * 4. Get current vehicle locations from Verizon
 *
 * Run with: node scripts/test-full-flow.js
 */

require('dotenv').config({ path: '.env.local' });

// Service Titan config
const ST_AUTH_URL = process.env.ST_AUTH_URL;
const ST_BASE_URL = process.env.ST_BASE_URL;
const ST_CLIENT_ID = process.env.ST_CLIENT_ID;
const ST_CLIENT_SECRET = process.env.ST_CLIENT_SECRET;
const ST_TENANT_ID = process.env.ST_TENANT_ID;
const ST_APPLICATION_KEY = process.env.ST_APPLICATION_KEY;

// Verizon config
const VERIZON_API_URL = process.env.VERIZON_API_URL || 'https://fim.api.us.fleetmatics.com';
const VERIZON_USERNAME = process.env.VERIZON_USERNAME;
const VERIZON_PASSWORD = process.env.VERIZON_PASSWORD;
const VERIZON_APP_ID = 'fleetmatics-p-us-IsVqHeP2nslCQYVYMBTpbPiFW6udcPl14dw5GAbA';

// Truck-Technician mapping (from Warehouse Operations database)
// In production, this would be stored in Supabase
const TRUCK_TECHNICIAN_MAP = {
  'Hunter Kersey': '1501',
  'Theodore Vanstory': '1602',
  'John Hamrick': '1703',
  'Zackery Pace': '1805',
  'Gerrell Davis': '1907',
  'Gino Gomez': '1908',
  'Dylan Rhodes': '1909',
  'Ross Baxter': '1910',
  'Kleadus Foreman': '1911',
  'Brandon Berrier': '1912',
  'Robert Johnson': '1913',
  'Chris McCue': '1914',
  'Mike Faucette': '1915',
  'Justin Sherman': '2016',
  'Dakota Gentle': '2018',
  'Jay Reyes': '2020',
  'Brett Baker': '2021',
  'Jon Adams': '2022',
  'Andrew Duncan': '2123',
  'Jonathan Figueroa': '2124',
};

console.log('=== Tech Truth - Full Integration Test ===\n');

// ============= SERVICE TITAN API =============

async function getSTAccessToken() {
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', ST_CLIENT_ID);
  params.append('client_secret', ST_CLIENT_SECRET);

  const response = await fetch(ST_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await response.json();
  if (!response.ok) throw new Error('ST Token failed: ' + JSON.stringify(data));
  return data.access_token;
}

async function stApiCall(token, endpoint, params = {}) {
  const url = new URL(`${ST_BASE_URL}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) url.searchParams.append(key, value);
  });

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${token}`,
      'ST-App-Key': ST_APPLICATION_KEY,
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json();
  return { ok: response.ok, status: response.status, data };
}

// ============= VERIZON API =============

async function getVerizonToken() {
  const credentials = Buffer.from(`${VERIZON_USERNAME}:${VERIZON_PASSWORD}`).toString('base64');
  const response = await fetch(`${VERIZON_API_URL}/token`, {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) throw new Error('Verizon token failed');
  return await response.text();
}

async function getVehicleLocation(token, vehicleNumber) {
  const response = await fetch(
    `${VERIZON_API_URL}/rad/v1/vehicles/${vehicleNumber}/location`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Atmosphere atmosphere_app_id=${VERIZON_APP_ID}, Bearer ${token}`,
        'Accept': 'application/json',
      },
    }
  );

  if (!response.ok) return null;
  return await response.json();
}

// ============= MAIN FLOW =============

async function main() {
  try {
    // Step 1: Get Service Titan token
    console.log('=== 1. Service Titan Authentication ===');
    const stToken = await getSTAccessToken();
    console.log('   ✓ Got Service Titan access token\n');

    // Step 2: Get technicians
    console.log('=== 2. Get Service Titan Technicians ===');
    const techResult = await stApiCall(stToken, `/settings/v2/tenant/${ST_TENANT_ID}/technicians`, {
      active: 'true',
      pageSize: 50
    });

    if (!techResult.ok) {
      console.log('   ✗ Failed:', techResult.data);
      return;
    }

    const technicians = techResult.data.data || [];
    console.log(`   ✓ Found ${technicians.length} technicians`);

    // Build technician lookup map
    const techMap = {};
    technicians.forEach(t => {
      techMap[t.id] = {
        id: t.id,
        name: t.name,
        businessUnitId: t.businessUnitId,
        // Try to find their truck number
        truckNumber: TRUCK_TECHNICIAN_MAP[t.name] || null
      };
    });

    // Show sample
    console.log('\n   Sample technicians with truck mapping:');
    const sampleTechs = technicians.slice(0, 5);
    sampleTechs.forEach(t => {
      const truck = TRUCK_TECHNICIAN_MAP[t.name] || 'NO TRUCK';
      console.log(`     - ${t.name} (ID: ${t.id}) → Truck: ${truck}`);
    });

    // Step 3: Get today's appointments
    console.log('\n=== 3. Get Today\'s Appointments ===');
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
    const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString();

    const aptsResult = await stApiCall(stToken, `/jpm/v2/tenant/${ST_TENANT_ID}/appointments`, {
      startsOnOrAfter: startOfDay,
      startsBefore: endOfDay,
      pageSize: 20
    });

    if (!aptsResult.ok) {
      console.log('   ✗ Failed:', aptsResult.data);
      return;
    }

    const appointments = aptsResult.data.data || [];
    console.log(`   ✓ Found ${appointments.length} appointments today`);

    if (appointments.length > 0) {
      console.log('\n   Appointment fields available:');
      console.log('   ', Object.keys(appointments[0]).join(', '));
    }

    // Step 4: Get appointment assignments (technician -> appointment)
    console.log('\n=== 4. Get Appointment Assignments ===');
    const assignResult = await stApiCall(stToken, `/dispatch/v2/tenant/${ST_TENANT_ID}/appointment-assignments`, {
      startsOnOrAfter: startOfDay,
      startsBefore: endOfDay,
      pageSize: 50
    });

    let assignments = [];
    if (assignResult.ok && assignResult.data.data) {
      assignments = assignResult.data.data;
      console.log(`   ✓ Found ${assignments.length} technician assignments`);

      if (assignments.length > 0) {
        console.log('\n   Assignment fields available:');
        console.log('   ', Object.keys(assignments[0]).join(', '));

        console.log('\n   Sample assignments:');
        assignments.slice(0, 5).forEach(a => {
          const truck = TRUCK_TECHNICIAN_MAP[a.technicianName] || 'NO TRUCK';
          console.log(`     - ${a.technicianName} assigned to job ${a.jobId} (apt ${a.appointmentId}) → Truck: ${truck}`);
        });
      }
    } else {
      console.log('   ✗ No assignment data');
    }

    // Step 5: Get Verizon GPS data for assigned technicians
    console.log('\n=== 5. Get Verizon GPS Locations ===');
    const verizonToken = await getVerizonToken();
    console.log('   ✓ Got Verizon token\n');

    // Get unique trucks from assignments
    const trucksToQuery = new Set();
    assignments.forEach(a => {
      const truckNum = TRUCK_TECHNICIAN_MAP[a.technicianName];
      if (truckNum) trucksToQuery.add(truckNum);
    });

    // Also add some known trucks for testing
    ['2021', '1501', '2124'].forEach(t => trucksToQuery.add(t));

    console.log(`   Querying ${trucksToQuery.size} trucks for GPS data...\n`);

    const gpsResults = [];
    for (const truckNum of trucksToQuery) {
      const location = await getVehicleLocation(verizonToken, truckNum);
      if (location) {
        gpsResults.push({
          truckNumber: truckNum,
          latitude: location.Latitude,
          longitude: location.Longitude,
          address: location.Address?.AddressLine1,
          city: location.Address?.Locality,
          speed: location.Speed,
          state: location.DisplayState,
          updatedAt: location.UpdateUTC
        });
        console.log(`   ✓ Truck ${truckNum}: ${location.Address?.Locality || 'Unknown'} - ${location.DisplayState}`);
      } else {
        console.log(`   ✗ Truck ${truckNum}: No GPS data`);
      }
    }

    // Step 6: Show complete picture
    console.log('\n=== 6. Complete Data Picture ===');
    console.log('\nToday\'s assignments with GPS status:\n');

    let matchCount = 0;
    for (const assignment of assignments.slice(0, 10)) {
      const truckNum = TRUCK_TECHNICIAN_MAP[assignment.technicianName];
      const gps = gpsResults.find(g => g.truckNumber === truckNum);

      console.log(`Tech: ${assignment.technicianName}`);
      console.log(`  - Job ID: ${assignment.jobId}`);
      console.log(`  - Appointment ID: ${assignment.appointmentId}`);
      console.log(`  - Truck: ${truckNum || 'NOT MAPPED'}`);

      if (gps) {
        matchCount++;
        console.log(`  - GPS: ${gps.city || 'Unknown'} (${gps.state})`);
        console.log(`  - Last Update: ${gps.updatedAt}`);
      } else {
        console.log(`  - GPS: NO DATA`);
      }
      console.log('');
    }

    console.log('=== Summary ===');
    console.log(`Technicians: ${technicians.length}`);
    console.log(`Today's Appointments: ${appointments.length}`);
    console.log(`Technician Assignments: ${assignments.length}`);
    console.log(`Trucks with GPS: ${gpsResults.length}`);
    console.log(`Assignments with GPS match: ${matchCount}`);

    console.log('\n=== Required Schema Updates ===');
    console.log('Based on this analysis, Tech Truth needs:');
    console.log('1. technicians table - store ST technician ID, name, and truck number');
    console.log('2. jobs/appointments table - store job details with scheduled arrival times');
    console.log('3. gps_events table - store Verizon location updates');
    console.log('4. arrival_discrepancies table - calculated arrival vs scheduled times');

  } catch (error) {
    console.error('\nFATAL ERROR:', error.message);
    console.error(error.stack);
  }
}

main();
