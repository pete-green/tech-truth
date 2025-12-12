const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function calculateDistanceFeet(lat1, lon1, lat2, lon2) {
  const R = 20902231; // Earth's radius in feet
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

async function check() {
  const jobLat = 36.1492192;
  const jobLon = -79.833329;

  // Get all GPS events for Hunter on Nov 13
  const { data: gpsEvents } = await supabase
    .from('gps_events')
    .select('latitude, longitude, timestamp, address')
    .eq('technician_id', '68bf519a-1b9b-436e-9118-fec2db547e4a')
    .gte('timestamp', '2025-11-13T00:00:00Z')
    .lte('timestamp', '2025-11-13T23:59:59Z')
    .order('timestamp', { ascending: true });

  console.log('Found ' + (gpsEvents?.length || 0) + ' GPS points for Nov 13\n');

  if (gpsEvents) {
    console.log('Checking distances from job site (5 Giltspur Court):\n');

    let closestDistance = Infinity;
    let closestPoint = null;

    for (const event of gpsEvents) {
      const distance = calculateDistanceFeet(jobLat, jobLon, event.latitude, event.longitude);
      const miles = (distance / 5280).toFixed(2);
      const time = new Date(event.timestamp).toLocaleTimeString('en-US', { timeZone: 'America/New_York' });

      if (distance < closestDistance) {
        closestDistance = distance;
        closestPoint = { ...event, distance, time };
      }

      console.log(time + ': ' + miles + ' miles away - ' + (event.address || 'No address'));
    }

    console.log('\n--- CLOSEST POINT ---');
    console.log('Time: ' + closestPoint.time);
    console.log('Distance: ' + (closestPoint.distance / 5280).toFixed(2) + ' miles (' + Math.round(closestPoint.distance) + ' feet)');
    console.log('Address: ' + closestPoint.address);
  }
}

check().catch(console.error);
