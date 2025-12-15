// Backfill script using local dev server (no timeout limits)
// Run with: node scripts/backfill-local.js

const BASE_URL = 'http://localhost:3000';
const DAYS_TO_BACKFILL = 14; // Two weeks

async function backfillDay(date) {
  const dateStr = date.toISOString().split('T')[0];
  console.log(`\nSyncing ${dateStr}...`);

  try {
    const response = await fetch(`${BASE_URL}/api/sync-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: dateStr,
        firstJobOnly: false
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.log(`  ERROR: ${response.status} - ${text.substring(0, 200)}`);
      return { date: dateStr, success: false, error: response.status };
    }

    const data = await response.json();
    console.log(`  Jobs: ${data.summary?.jobsProcessed || 0}, Late: ${data.summary?.lateArrivals || 0}`);
    return { date: dateStr, success: true, ...data.summary };
  } catch (error) {
    console.log(`  ERROR: ${error.message}`);
    return { date: dateStr, success: false, error: error.message };
  }
}

async function main() {
  console.log(`Backfilling ${DAYS_TO_BACKFILL} days of job data...`);
  console.log(`Using local server: ${BASE_URL}`);

  const results = [];
  const today = new Date();

  // Go backwards from yesterday (today is already synced)
  for (let i = 1; i <= DAYS_TO_BACKFILL; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);

    // Skip weekends
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      console.log(`\nSkipping ${date.toISOString().split('T')[0]} (weekend)`);
      continue;
    }

    const result = await backfillDay(date);
    results.push(result);

    // Small delay to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Summary
  console.log('\n========== BACKFILL COMPLETE ==========');
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const totalJobs = successful.reduce((sum, r) => sum + (r.jobsProcessed || 0), 0);

  console.log(`Days processed: ${successful.length}`);
  console.log(`Days failed: ${failed.length}`);
  console.log(`Total jobs synced: ${totalJobs}`);

  if (failed.length > 0) {
    console.log('\nFailed dates:');
    failed.forEach(r => console.log(`  ${r.date}: ${r.error}`));
  }
}

main().catch(console.error);
