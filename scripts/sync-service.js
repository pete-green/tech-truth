#!/usr/bin/env node
/**
 * Tech Truth Sync Service
 * Runs continuously, syncing GPS, jobs, and punch data every 5 minutes
 */

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

async function runSync() {
  const today = new Date().toISOString().split('T')[0];
  console.log(`[${new Date().toISOString()}] Starting sync for ${today}`);

  const results = {
    gps: null,
    jobs: null,
    punches: null,
    errors: []
  };

  // Step 1: GPS Sync
  try {
    console.log('  → Syncing GPS data...');
    const gpsRes = await fetch(`${APP_URL}/api/sync-gps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: today }),
    });
    results.gps = await gpsRes.json();
    console.log(`    ✓ GPS: ${results.gps.summary?.eventsInserted || 0} events`);
  } catch (err) {
    results.errors.push(`GPS: ${err.message}`);
    console.error(`    ✗ GPS error: ${err.message}`);
  }

  // Step 2: Job/Arrival Sync
  try {
    console.log('  → Syncing job/arrival data...');
    const jobRes = await fetch(`${APP_URL}/api/sync-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: today }),
    });
    results.jobs = await jobRes.json();
    console.log(`    ✓ Jobs: ${results.jobs.summary?.jobsProcessed || 0} processed, ${results.jobs.summary?.lateArrivals || 0} late`);
  } catch (err) {
    results.errors.push(`Jobs: ${err.message}`);
    console.error(`    ✗ Jobs error: ${err.message}`);
  }

  // Step 3: Punch Sync
  try {
    console.log('  → Syncing punch data...');
    const punchRes = await fetch(`${APP_URL}/api/sync-punches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: today }),
    });
    results.punches = await punchRes.json();
    console.log(`    ✓ Punches: ${results.punches.processed || 0} processed`);
  } catch (err) {
    results.errors.push(`Punches: ${err.message}`);
    console.error(`    ✗ Punches error: ${err.message}`);
  }

  const status = results.errors.length === 0 ? '✓ Complete' : '⚠ Completed with errors';
  console.log(`[${new Date().toISOString()}] Sync ${status}\n`);

  return results;
}

async function main() {
  console.log('='.repeat(60));
  console.log('Tech Truth Sync Service');
  console.log(`Interval: ${SYNC_INTERVAL_MS / 1000 / 60} minutes`);
  console.log(`App URL: ${APP_URL}`);
  console.log('='.repeat(60));
  console.log('');

  // Wait a bit for the app to start
  console.log('Waiting 30 seconds for app to start...');
  await new Promise(r => setTimeout(r, 30000));

  // Run immediately on start
  await runSync();

  // Then run on interval
  setInterval(runSync, SYNC_INTERVAL_MS);
}

main().catch(console.error);
