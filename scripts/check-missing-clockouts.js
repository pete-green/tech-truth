// Check scope of missing clock-outs across all employees
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log('=== Missing Clock-Out Analysis ===\n');

  // Get all ClockIn records from the last 14 days that have clock_out_time = null
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const startDate = fourteenDaysAgo.toISOString().split('T')[0];

  // Don't count today - people might still be working
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const endDate = yesterday.toISOString().split('T')[0];

  console.log(`Checking dates from ${startDate} to ${endDate}\n`);

  const { data: missingClockOuts, error } = await supabase
    .from('punch_records')
    .select('id, punch_date, punch_time, technician_id, paylocity_employee_id, origin')
    .eq('punch_type', 'ClockIn')
    .is('clock_out_time', null)
    .gte('punch_date', startDate)
    .lte('punch_date', endDate)
    .order('punch_date', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Total ClockIn records missing clock_out_time: ${missingClockOuts.length}\n`);

  // Get technician names
  const techIds = [...new Set(missingClockOuts.map(p => p.technician_id))];
  const { data: technicians } = await supabase
    .from('technicians')
    .select('id, name')
    .in('id', techIds);

  const techMap = new Map(technicians?.map(t => [t.id, t.name]) || []);

  // Group by date
  const byDate = {};
  for (const punch of missingClockOuts) {
    if (!byDate[punch.punch_date]) {
      byDate[punch.punch_date] = [];
    }
    byDate[punch.punch_date].push({
      name: techMap.get(punch.technician_id) || 'Unknown',
      paylocityId: punch.paylocity_employee_id,
      origin: punch.origin,
    });
  }

  console.log('=== Missing Clock-Outs by Date ===\n');
  const dates = Object.keys(byDate).sort().reverse();
  for (const date of dates) {
    const techs = byDate[date];
    console.log(`${date}: ${techs.length} missing`);
    for (const tech of techs) {
      console.log(`  - ${tech.name} (${tech.paylocityId}) via ${tech.origin}`);
    }
    console.log('');
  }

  // Summary stats
  console.log('\n=== Summary ===');
  console.log(`Total missing clock-outs in last 14 days: ${missingClockOuts.length}`);
  console.log(`Affected employees: ${techIds.length}`);
  console.log(`Days with missing data: ${dates.length}`);
}

main().catch(console.error);
