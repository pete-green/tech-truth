const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Verizon config
const VERIZON_CONFIG = {
  baseUrl: process.env.VERIZON_API_URL,
  apiKey: process.env.VERIZON_API_KEY,
};

async function verizonFetch(path) {
  const response = await fetch(`${VERIZON_CONFIG.baseUrl}${path}`, {
    headers: {
      'X-ApiKey': VERIZON_CONFIG.apiKey,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Verizon API error: ${response.status} - ${text}`);
  }

  return response.json();
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Find Andrew Duncan's vehicle ID
  const { data: tech } = await supabase
    .from('technicians')
    .select('id, name, verizon_vehicle_id, home_latitude, home_longitude, home_address')
    .ilike('name', '%Andrew Duncan%')
    .single();

  console.log('Andrew Duncan:', tech);

  if (!tech || !tech.verizon_vehicle_id) {
    console.log('No vehicle ID found');
    return;
  }

  // Fetch GPS segments for Dec 15 - FULL day including end date
  const date = '2025-12-15';
  const startDateUtc = `${date}T00:00:00Z`;
  const endDateUtc = `${date}T23:59:59Z`;

  console.log(`\nFetching GPS segments for ${date}...`);
  console.log(`Start: ${startDateUtc}`);
  console.log(`End: ${endDateUtc}`);

  try {
    const url = `/rad/v1/vehicles/${tech.verizon_vehicle_id}/segments?startdateutc=${startDateUtc}&enddateutc=${endDateUtc}`;
    console.log('URL:', url);

    const response = await verizonFetch(url);

    // Handle array response
    const data = Array.isArray(response) && response.length > 0 ? response[0] : response;
    const segments = data?.Segments || [];

    console.log(`\nFound ${segments.length} segments for Dec 15`);

    // Show all segments
    segments.forEach((seg, i) => {
      const startTime = seg.StartDateUtc ? new Date(seg.StartDateUtc).toLocaleTimeString('en-US', { timeZone: 'America/New_York' }) : 'N/A';
      const endTime = seg.EndDateUtc ? new Date(seg.EndDateUtc).toLocaleTimeString('en-US', { timeZone: 'America/New_York' }) : 'N/A';
      const startAddr = seg.StartLocation?.AddressLine1 || 'Unknown';
      const endAddr = seg.EndLocation?.AddressLine1 || 'Unknown';

      console.log(`\n[${i + 1}] ${startTime} - ${endTime}`);
      console.log(`    Start: ${startAddr}`);
      console.log(`    End: ${endAddr}`);
    });

    // Show last few segments in detail
    console.log('\n=== Last 3 segments (full detail) ===');
    segments.slice(-3).forEach((seg, i) => {
      console.log(`\nSegment ${segments.length - 2 + i}:`);
      console.log(JSON.stringify(seg, null, 2));
    });

  } catch (error) {
    console.error('Error:', error.message);
  }
}

main().catch(console.error);
