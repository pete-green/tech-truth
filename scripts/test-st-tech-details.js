/**
 * Get detailed technician info from Service Titan
 * Looking for vehicle/truck assignment data
 * Run with: node scripts/test-st-tech-details.js
 */

require('dotenv').config({ path: '.env.local' });

const ST_AUTH_URL = process.env.ST_AUTH_URL;
const ST_BASE_URL = process.env.ST_BASE_URL;
const ST_CLIENT_ID = process.env.ST_CLIENT_ID;
const ST_CLIENT_SECRET = process.env.ST_CLIENT_SECRET;
const ST_TENANT_ID = process.env.ST_TENANT_ID;
const ST_APPLICATION_KEY = process.env.ST_APPLICATION_KEY;

async function getAccessToken() {
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
  if (!response.ok) throw new Error('Token failed: ' + JSON.stringify(data));
  return data.access_token;
}

async function apiCall(token, endpoint, params = {}) {
  const url = new URL(`${ST_BASE_URL}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) url.searchParams.append(key, value);
  });

  console.log('   Calling:', url.pathname + url.search);

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${token}`,
      'ST-App-Key': ST_APPLICATION_KEY,
      'Content-Type': 'application/json',
    },
  });

  const text = await response.text();
  try {
    return { ok: response.ok, status: response.status, data: JSON.parse(text) };
  } catch {
    return { ok: response.ok, status: response.status, data: text };
  }
}

async function main() {
  try {
    const token = await getAccessToken();
    console.log('Got access token\n');

    // Get all technicians with ALL fields
    console.log('=== 1. Full Technician Details ===');
    const techResult = await apiCall(token, `/settings/v2/tenant/${ST_TENANT_ID}/technicians`, {
      active: 'true',
      pageSize: 10
    });

    if (techResult.ok && techResult.data.data) {
      const techs = techResult.data.data;
      console.log(`\nFound ${techs.length} technicians\n`);

      // Print FULL first technician
      console.log('=== First technician - ALL FIELDS ===');
      console.log(JSON.stringify(techs[0], null, 2));

      console.log('\n=== All field names ===');
      console.log(Object.keys(techs[0]).join(', '));

      // List all techs with any vehicle-related fields
      console.log('\n=== Looking for vehicle/truck fields ===');
      const vehicleFields = Object.keys(techs[0]).filter(k =>
        k.toLowerCase().includes('vehicle') ||
        k.toLowerCase().includes('truck') ||
        k.toLowerCase().includes('car') ||
        k.toLowerCase().includes('equipment')
      );
      console.log('Vehicle-related fields found:', vehicleFields.length > 0 ? vehicleFields : 'NONE');
    }

    // Try employee endpoint
    console.log('\n=== 2. Try employees endpoint ===');
    const empResult = await apiCall(token, `/settings/v2/tenant/${ST_TENANT_ID}/employees`, {
      pageSize: 5
    });

    if (empResult.ok && empResult.data.data) {
      console.log('Employees found:', empResult.data.data.length);
      if (empResult.data.data.length > 0) {
        console.log('\nFirst employee:');
        console.log(JSON.stringify(empResult.data.data[0], null, 2));
      }
    } else {
      console.log('Error:', empResult.status, empResult.data);
    }

    // Try dispatch zones - might have tech-zone-vehicle mapping
    console.log('\n=== 3. Try dispatch zones/teams ===');
    const zonesResult = await apiCall(token, `/dispatch/v2/tenant/${ST_TENANT_ID}/zones`, {
      pageSize: 10
    });

    if (zonesResult.ok && zonesResult.data) {
      console.log('Zones response:', JSON.stringify(zonesResult.data, null, 2).substring(0, 500));
    } else {
      console.log('Error:', zonesResult.status);
    }

    // Try equipment endpoint - might have vehicle assignments
    console.log('\n=== 4. Try equipment endpoint ===');
    const equipResult = await apiCall(token, `/equipmentsystems/v2/tenant/${ST_TENANT_ID}/equipment`, {
      pageSize: 5
    });

    if (equipResult.ok && equipResult.data) {
      console.log('Equipment response:', JSON.stringify(equipResult.data, null, 2).substring(0, 500));
    } else {
      console.log('Error:', equipResult.status);
    }

    // Try forms/custom fields
    console.log('\n=== 5. Try custom fields ===');
    const cfResult = await apiCall(token, `/settings/v2/tenant/${ST_TENANT_ID}/custom-fields`, {
      pageSize: 20
    });

    if (cfResult.ok && cfResult.data) {
      const fields = cfResult.data.data || [];
      console.log(`Found ${fields.length} custom fields`);
      const vehicleFields = fields.filter(f =>
        f.name?.toLowerCase().includes('vehicle') ||
        f.name?.toLowerCase().includes('truck') ||
        f.name?.toLowerCase().includes('van')
      );
      if (vehicleFields.length > 0) {
        console.log('Vehicle-related custom fields:', vehicleFields.map(f => f.name));
      }
    }

    // Try GPS tracking endpoint
    console.log('\n=== 6. Try GPS Tracking endpoint ===');
    const gpsResult = await apiCall(token, `/dispatch/v2/tenant/${ST_TENANT_ID}/gps-tracking`);

    if (gpsResult.ok) {
      console.log('GPS response:', JSON.stringify(gpsResult.data, null, 2).substring(0, 500));
    } else {
      console.log('Error:', gpsResult.status);
    }

  } catch (error) {
    console.error('ERROR:', error.message);
  }
}

main();
