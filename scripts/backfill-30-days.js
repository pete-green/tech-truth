// Backfill script to sync GPS arrival data for the past 30 days
// Run with: node scripts/backfill-30-days.js

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function syncDate(dateStr) {
  console.log(`\nSyncing ${dateStr}...`);

  try {
    const response = await fetch(`${BASE_URL}/api/sync-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        date: dateStr,
        firstJobOnly: true,
      }),
    });

    const result = await response.json();

    if (result.success) {
      console.log(`  ✓ ${dateStr}: ${result.summary.firstJobsProcessed} jobs, ${result.summary.lateArrivals} late`);
      return result;
    } else {
      console.log(`  ✗ ${dateStr}: ${result.error}`);
      return null;
    }
  } catch (error) {
    console.log(`  ✗ ${dateStr}: ${error.message}`);
    return null;
  }
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

async function main() {
  console.log('='.repeat(60));
  console.log('Backfilling GPS arrival data for the past 30 days');
  console.log('='.repeat(60));

  const today = new Date();
  const results = {
    success: 0,
    failed: 0,
    totalJobs: 0,
    totalLate: 0,
  };

  // Go back 30 days
  for (let i = 1; i <= 30; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);

    // Skip weekends (Sunday = 0, Saturday = 6)
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      console.log(`\nSkipping ${formatDate(date)} (weekend)`);
      continue;
    }

    const result = await syncDate(formatDate(date));

    if (result?.success) {
      results.success++;
      results.totalJobs += result.summary.firstJobsProcessed || 0;
      results.totalLate += result.summary.lateArrivals || 0;
    } else {
      results.failed++;
    }

    // Small delay to avoid overwhelming the APIs
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log('\n' + '='.repeat(60));
  console.log('Backfill Complete!');
  console.log('='.repeat(60));
  console.log(`Days synced: ${results.success}`);
  console.log(`Days failed: ${results.failed}`);
  console.log(`Total jobs processed: ${results.totalJobs}`);
  console.log(`Total late arrivals: ${results.totalLate}`);
}

main().catch(console.error);
