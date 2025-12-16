import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';

// End-of-day reconciliation sync
// Runs at 11:30 PM EST daily (4:30 AM UTC) to ensure all data is captured
// - Catches late clock-outs from technicians who work late
// - Fetches complete GPS segments for the day (arrivals home, etc.)
// - Ensures no data is missed before the next business day

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  console.log('End-of-day sync triggered at:', new Date().toISOString());

  // Get the base URL from environment or construct it
  const baseUrl = process.env.URL || process.env.DEPLOY_URL || 'https://tech-truth.netlify.app';

  // Calculate today's date in EST
  // This function runs at 4:30 AM UTC = 11:30 PM EST
  // So we want to sync "today" in EST terms
  const now = new Date();
  // EST is UTC-5 (ignoring DST for simplicity - close enough for this use case)
  const estOffset = 5 * 60 * 60 * 1000;
  const estNow = new Date(now.getTime() - estOffset);
  const todayDate = estNow.toISOString().split('T')[0];

  console.log(`Running end-of-day sync for date: ${todayDate}`);

  const results: {
    syncData?: any;
    punchData?: any;
    errors: string[];
  } = { errors: [] };

  try {
    // Step 1: Full sync of job/GPS/arrival data for today
    // Use fullDay: true to process all jobs (not just first jobs)
    console.log('Step 1: Full sync of job/GPS/arrival data...');
    const syncResponse = await fetch(`${baseUrl}/api/sync-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: todayDate,
        firstJobOnly: false, // Process ALL jobs for end-of-day
      }),
    });

    if (syncResponse.ok) {
      results.syncData = await syncResponse.json();
      console.log('Full sync completed:', results.syncData.summary);
    } else {
      const errorData = await syncResponse.json();
      results.errors.push(`Full sync failed: ${errorData.error || 'Unknown error'}`);
      console.error('Full sync error:', errorData);
    }

    // Step 2: Sync Paylocity punch data (catch any late clock-outs)
    console.log('Step 2: Syncing Paylocity punch data (late clock-outs)...');
    const punchResponse = await fetch(`${baseUrl}/api/sync-punches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: todayDate }),
    });

    if (punchResponse.ok) {
      results.punchData = await punchResponse.json();
      console.log('Punch sync completed:', {
        processed: results.punchData.processed,
        violations: results.punchData.violations,
        missingClockOuts: results.punchData.missingClockOuts || 0,
      });
    } else {
      const errorData = await punchResponse.json();
      results.errors.push(`Punch sync failed: ${errorData.error || 'Unknown error'}`);
      console.error('Punch sync error:', errorData);
    }

    // Return combined results
    const hasErrors = results.errors.length > 0;
    return {
      statusCode: hasErrors ? 207 : 200,
      body: JSON.stringify({
        success: !hasErrors,
        message: hasErrors ? 'End-of-day sync completed with errors' : 'End-of-day sync completed',
        timestamp: new Date().toISOString(),
        date: todayDate,
        syncData: results.syncData?.summary,
        punchData: results.punchData ? {
          processed: results.punchData.processed,
          violations: results.punchData.violations,
          missingClockOuts: results.punchData.missingClockOuts || 0,
        } : null,
        errors: results.errors,
      }),
    };
  } catch (error: any) {
    console.error('End-of-day sync error:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message || 'End-of-day sync failed',
        timestamp: new Date().toISOString(),
      }),
    };
  }
};

export { handler };
