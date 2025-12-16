// Check full GPS data for a technician using the actual verizon-connect library
// Run with: node scripts/check-gps-full.js [techName] [date]

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const VERIZON_CONFIG = {
  apiUrl: process.env.VERIZON_API_URL || 'https://fim.api.us.fleetmatics.com',
  username: process.env.VERIZON_USERNAME || '',
  password: process.env.VERIZON_PASSWORD || '',
  appId: 'fleetmatics-p-us-IsVqHeP2nslCQYVYMBTpbPiFW6udcPl14dw5GAbA',
};

let cachedToken = null;
let tokenExpiry = null;

function getBasicAuthHeader() {
  const credentials = `${VERIZON_CONFIG.username}:${VERIZON_CONFIG.password}`;
  return `Basic ${Buffer.from(credentials).toString('base64')}`;
}

async function getVerizonToken() {
  if (cachedToken && tokenExpiry && tokenExpiry > new Date()) {
    return cachedToken;
  }

  const response = await fetch(`${VERIZON_CONFIG.apiUrl}/token`, {
    method: 'GET',
    headers: {
      Authorization: getBasicAuthHeader(),
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to auth: ${await response.text()}`);
  }

  const tokenText = await response.text();
  cachedToken = tokenText.startsWith('{') ? JSON.parse(tokenText).token : tokenText;
  tokenExpiry = new Date(Date.now() + 55 * 60 * 1000);
  return cachedToken;
}

async function verizonFetch(endpoint) {
  const token = await getVerizonToken();
  const response = await fetch(`${VERIZON_CONFIG.apiUrl}${endpoint}`, {
    headers: {
      Authorization: `Atmosphere atmosphere_app_id=${VERIZON_CONFIG.appId}, Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Verizon API error: ${await response.text()}`);
  }

  return response.json();
}

async function main() {
  const techName = process.argv[2] || 'Andrew Duncan';
  const date = process.argv[3] || '2025-12-15';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Find technician
  const { data: tech } = await supabase
    .from('technicians')
    .select('id, name, verizon_vehicle_id, home_latitude, home_longitude, home_address, takes_truck_home')
    .ilike('name', `%${techName}%`)
    .single();

  if (!tech) {
    console.log('Technician not found:', techName);
    return;
  }

  console.log('Technician:', tech.name);
  console.log('Vehicle ID:', tech.verizon_vehicle_id);
  console.log('Takes truck home:', tech.takes_truck_home);
  console.log('Home:', tech.home_address);
  console.log('Home coords:', tech.home_latitude, tech.home_longitude);

  if (!tech.verizon_vehicle_id) {
    console.log('No vehicle ID assigned');
    return;
  }

  // Fetch GPS segments
  const startDateUtc = `${date}T00:00:00Z`;
  const endDateUtc = `${date}T23:59:59Z`;

  console.log(`\nFetching GPS segments for ${date}...`);

  try {
    const url = `/rad/v1/vehicles/${tech.verizon_vehicle_id}/segments?startdateutc=${startDateUtc}&enddateutc=${endDateUtc}`;
    const response = await verizonFetch(url);

    const data = Array.isArray(response) && response.length > 0 ? response[0] : response;
    const segments = data?.Segments || [];

    console.log(`Found ${segments.length} GPS segments\n`);

    // Calculate distance from home for classification
    function distanceFeet(lat1, lon1, lat2, lon2) {
      const R = 20902231;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function classifyLocation(lat, lon) {
      // Office location (Go Green HQ)
      const officeDist = distanceFeet(lat, lon, 36.0952, -79.8273);
      if (officeDist <= 500) return 'OFFICE';

      // Home location
      if (tech.home_latitude && tech.home_longitude) {
        const homeDist = distanceFeet(lat, lon, tech.home_latitude, tech.home_longitude);
        if (homeDist <= 1000) return 'HOME';
      }

      return 'other';
    }

    // Show all segments with classification
    segments.forEach((seg, i) => {
      const startTime = seg.StartDateUtc
        ? new Date(seg.StartDateUtc).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' })
        : 'N/A';
      const endTime = seg.EndDateUtc
        ? new Date(seg.EndDateUtc).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' })
        : 'N/A';

      const startAddr = seg.StartLocation?.AddressLine1 || 'Unknown';
      const endAddr = seg.EndLocation?.AddressLine1 || 'Unknown';

      let startClass = 'unknown';
      if (seg.StartLocation) {
        startClass = classifyLocation(seg.StartLocation.Latitude, seg.StartLocation.Longitude);
      }

      let endClass = 'unknown';
      if (seg.EndLocation) {
        endClass = classifyLocation(seg.EndLocation.Latitude, seg.EndLocation.Longitude);
      }

      console.log(`[${i + 1}] Left ${startTime} (${startClass}) -> Arrived ${endTime} (${endClass})`);
      console.log(`    From: ${startAddr}`);
      console.log(`    To: ${endAddr}`);

      // Check if EndLocation is missing
      if (!seg.EndLocation) {
        console.log(`    ⚠️  NO END LOCATION (IsComplete: ${seg.IsComplete})`);
      }
      if (!seg.EndDateUtc) {
        console.log(`    ⚠️  NO END TIME (IsComplete: ${seg.IsComplete})`);
      }
    });

    // Summary
    console.log('\n=== SUMMARY ===');
    const lastSeg = segments[segments.length - 1];
    if (lastSeg) {
      const lastTime = lastSeg.EndDateUtc
        ? new Date(lastSeg.EndDateUtc).toLocaleTimeString('en-US', { timeZone: 'America/New_York' })
        : 'N/A';
      const lastEndClass = lastSeg.EndLocation
        ? classifyLocation(lastSeg.EndLocation.Latitude, lastSeg.EndLocation.Longitude)
        : 'unknown';
      console.log(`Last segment ends at: ${lastTime} (${lastEndClass})`);
      console.log(`IsComplete: ${lastSeg.IsComplete}`);

      if (lastEndClass !== 'HOME' && tech.takes_truck_home) {
        console.log(`⚠️  Technician takes truck home but last location is NOT HOME`);
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

main().catch(console.error);
