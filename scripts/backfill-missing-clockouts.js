#!/usr/bin/env node
/**
 * Backfill Missing Clock-Outs
 *
 * This script identifies dates with missing clock-out times and re-syncs them
 * from Paylocity to capture any clock-outs that were recorded after the original sync.
 *
 * Usage:
 *   node scripts/backfill-missing-clockouts.js           # Check last 14 days
 *   node scripts/backfill-missing-clockouts.js 30        # Check last 30 days
 *   node scripts/backfill-missing-clockouts.js --dry-run # Preview without syncing
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const API_BASE = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

async function findMissingClockOuts(daysBack = 14) {
  // Don't count today - people are still working
  const today = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  console.log(`\nChecking for missing clock-outs from ${startDate.toISOString().split('T')[0]} to ${yesterday.toISOString().split('T')[0]}...\n`);

  // Find all ClockIn records without clock_out_time
  const { data: missingClockOuts, error } = await supabase
    .from('punch_records')
    .select('id, punch_date, technician_id, paylocity_employee_id, origin')
    .eq('punch_type', 'ClockIn')
    .is('clock_out_time', null)
    .gte('punch_date', startDate.toISOString().split('T')[0])
    .lte('punch_date', yesterday.toISOString().split('T')[0])
    .order('punch_date', { ascending: false });

  if (error) {
    console.error('Error fetching missing clock-outs:', error);
    return null;
  }

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

  return { missingClockOuts, byDate, techMap };
}

async function syncDate(date) {
  console.log(`  Syncing ${date}...`);

  try {
    const response = await fetch(`${API_BASE}/api/sync-punches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error(`    Error syncing ${date}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const daysBack = parseInt(args.find(a => !a.startsWith('--')) || '14', 10);

  console.log('=== Backfill Missing Clock-Outs ===');
  if (dryRun) {
    console.log('*** DRY RUN MODE - No changes will be made ***');
  }

  const result = await findMissingClockOuts(daysBack);
  if (!result) {
    process.exit(1);
  }

  const { missingClockOuts, byDate } = result;
  const affectedDates = Object.keys(byDate).sort();

  console.log(`Found ${missingClockOuts.length} missing clock-outs across ${affectedDates.length} dates:\n`);

  for (const date of affectedDates) {
    const techs = byDate[date];
    console.log(`${date}: ${techs.length} missing`);
    for (const tech of techs) {
      console.log(`  - ${tech.name} (${tech.paylocityId}) via ${tech.origin}`);
    }
  }

  if (affectedDates.length === 0) {
    console.log('\n✓ No missing clock-outs found!');
    return;
  }

  if (dryRun) {
    console.log('\n*** DRY RUN - Skipping sync ***');
    console.log(`Would sync ${affectedDates.length} date(s): ${affectedDates.join(', ')}`);
    return;
  }

  console.log(`\n--- Re-syncing ${affectedDates.length} date(s) ---\n`);

  let totalFixed = 0;
  let totalErrors = 0;

  for (const date of affectedDates) {
    const result = await syncDate(date);
    if (result.success) {
      console.log(`    ✓ ${date}: ${result.clockOutsCreated || 0} clock-outs created`);
      totalFixed += result.clockOutsCreated || 0;
      if (result.errors?.length) {
        totalErrors += result.errors.length;
      }
    } else {
      console.log(`    ✗ ${date}: Failed`);
      totalErrors++;
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Dates synced: ${affectedDates.length}`);
  console.log(`Clock-outs created: ${totalFixed}`);
  if (totalErrors > 0) {
    console.log(`Errors: ${totalErrors}`);
  }

  // Verify remaining missing clock-outs
  console.log('\n--- Verification ---');
  const afterResult = await findMissingClockOuts(daysBack);
  if (afterResult) {
    const remaining = afterResult.missingClockOuts.length;
    console.log(`Remaining missing clock-outs: ${remaining}`);
    if (remaining > 0) {
      console.log('(Some may be genuine cases where employees forgot to clock out)');
    }
  }
}

main().catch(console.error);
