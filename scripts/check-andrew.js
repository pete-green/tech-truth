const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkAndrew() {
  // Find Andrew Duncan
  const { data: tech } = await supabase
    .from('technicians')
    .select('id, name, paylocity_employee_id, verizon_vehicle_id, takes_truck_home')
    .ilike('name', '%Andrew Duncan%')
    .single();

  console.log('Andrew Duncan:', tech);

  if (!tech) return;

  // Check punch records for Dec 15
  const { data: punches } = await supabase
    .from('punch_records')
    .select('*')
    .eq('technician_id', tech.id)
    .eq('punch_date', '2025-12-15')
    .order('punch_time');

  console.log('\nPunch records for Dec 15:');
  if (punches && punches.length > 0) {
    punches.forEach(p => {
      console.log('  -', p.punch_type, '@', p.punch_time);
      console.log('    GPS:', p.gps_location_type, '|', p.gps_address || 'no address');
      console.log('    Clock in:', p.clock_in_time, '| Clock out:', p.clock_out_time);
    });
  } else {
    console.log('  No punch records found');
  }

  // Check GPS segments - what does Verizon have for that day?
  console.log('\nChecking if GPS vehicle ID exists:', tech.verizon_vehicle_id);
}

checkAndrew().catch(console.error);
