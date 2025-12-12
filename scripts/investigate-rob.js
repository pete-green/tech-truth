const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function investigate() {
  // Find Rob Lorraine in technicians
  const { data: tech, error: techError } = await supabase
    .from('technicians')
    .select('*')
    .ilike('name', '%Rob Lorraine%')
    .single();

  if (techError) {
    console.log('Error finding technician:', techError);
    return;
  }

  console.log('=== ROB LORRAINE TECHNICIAN RECORD ===');
  console.log(JSON.stringify(tech, null, 2));

  // Check if he has a Verizon vehicle assigned
  if (!tech.verizon_vehicle_id) {
    console.log('\n*** NO VERIZON VEHICLE ASSIGNED ***');
    console.log('This is why no GPS arrival data is being recorded.');
    return;
  }

  console.log('\nVerizon Vehicle ID:', tech.verizon_vehicle_id);

  // Check one of his jobs
  const { data: jobs, error: jobsError } = await supabase
    .from('jobs')
    .select('*')
    .eq('technician_id', tech.id)
    .order('job_date', { ascending: false })
    .limit(3);

  console.log('\n=== RECENT JOBS ===');
  for (const job of jobs || []) {
    console.log('\nJob ' + job.st_job_id + ' on ' + job.job_date);
    console.log('  Scheduled: ' + job.scheduled_start);
    console.log('  Actual Arrival: ' + (job.actual_arrival || 'NOT DETECTED'));
    console.log('  Address: ' + job.job_address);
  }

  // Check for any GPS events for Rob
  const { data: gpsEvents, error: gpsError } = await supabase
    .from('gps_events')
    .select('*')
    .eq('technician_id', tech.id)
    .order('timestamp', { ascending: false })
    .limit(5);

  console.log('\n=== GPS EVENTS ===');
  console.log('Total GPS events found:', gpsEvents?.length || 0);
  if (gpsEvents && gpsEvents.length > 0) {
    console.log('Most recent:', gpsEvents[0].timestamp, gpsEvents[0].address);
  }
}

investigate().catch(console.error);
