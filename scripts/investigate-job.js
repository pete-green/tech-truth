const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function investigate() {
  // Find the job
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('*, technicians(name, verizon_vehicle_id)')
    .eq('st_job_id', 176041121)
    .single();

  if (jobError) {
    console.log('Job error:', jobError);
    return;
  }

  console.log('Job details:');
  console.log(JSON.stringify(job, null, 2));

  // Check for GPS events for this technician on that day
  const { data: gpsEvents, error: gpsError } = await supabase
    .from('gps_events')
    .select('*')
    .eq('technician_id', job.technician_id)
    .gte('timestamp', '2025-11-13T00:00:00Z')
    .lte('timestamp', '2025-11-13T23:59:59Z')
    .limit(10);

  console.log('\nGPS events for that day:', gpsEvents?.length || 0);
  if (gpsEvents?.length > 0) {
    console.log('Sample:', gpsEvents[0]);
  }

  // Check for any discrepancy record
  const { data: disc } = await supabase
    .from('arrival_discrepancies')
    .select('*')
    .eq('job_id', job.id);

  console.log('\nDiscrepancy record:', disc);
}

investigate().catch(console.error);
