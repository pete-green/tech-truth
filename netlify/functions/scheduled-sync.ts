import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';

// Scheduled function to sync ALL technician data continuously
// Runs every 15 minutes (configured in netlify.toml)
// Syncs: 1) GPS location data, 2) Job/arrival data, 3) Punch records from Paylocity

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  console.log('Scheduled sync triggered at:', new Date().toISOString());

  // Get the base URL from environment or construct it
  const baseUrl = process.env.URL || process.env.DEPLOY_URL || 'https://tech-truth.netlify.app';
  const todayDate = new Date().toISOString().split('T')[0];

  const results: {
    gpsData?: any;
    syncData?: any;
    punchData?: any;
    errors: string[];
  } = { errors: [] };

  try {
    // Step 1: Sync GPS location data (CRITICAL - this populates the database with GPS history)
    console.log('Step 1: Syncing GPS location data...');
    const gpsResponse = await fetch(`${baseUrl}/api/sync-gps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: todayDate }),
    });

    if (gpsResponse.ok) {
      results.gpsData = await gpsResponse.json();
      console.log('GPS sync completed:', results.gpsData.summary);
    } else {
      const errorData = await gpsResponse.json().catch(() => ({ error: 'Unknown error' }));
      results.errors.push(`GPS sync failed: ${errorData.error || 'Unknown error'}`);
      console.error('GPS sync error:', errorData);
    }

    // Step 2: Sync job/arrival data
    console.log('Step 2: Syncing job/arrival data...');
    const syncResponse = await fetch(`${baseUrl}/api/sync-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: todayDate,
        firstJobOnly: true,
      }),
    });

    if (syncResponse.ok) {
      results.syncData = await syncResponse.json();
      console.log('Sync data completed:', results.syncData.summary);
    } else {
      const errorData = await syncResponse.json().catch(() => ({ error: 'Unknown error' }));
      results.errors.push(`Sync data failed: ${errorData.error || 'Unknown error'}`);
      console.error('Sync data error:', errorData);
    }

    // Step 3: Sync Paylocity punch data (clock in/out)
    console.log('Step 3: Syncing Paylocity punch data...');
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
      });
    } else {
      const errorData = await punchResponse.json().catch(() => ({ error: 'Unknown error' }));
      results.errors.push(`Punch sync failed: ${errorData.error || 'Unknown error'}`);
      console.error('Punch sync error:', errorData);
    }

    // Return combined results
    const hasErrors = results.errors.length > 0;
    return {
      statusCode: hasErrors ? 207 : 200, // 207 = Multi-Status (partial success)
      body: JSON.stringify({
        success: !hasErrors,
        message: hasErrors ? 'Scheduled sync completed with errors' : 'Scheduled sync completed',
        timestamp: new Date().toISOString(),
        date: todayDate,
        gpsData: results.gpsData?.summary,
        syncData: results.syncData?.summary,
        punchData: results.punchData ? {
          processed: results.punchData.processed,
          violations: results.punchData.violations,
        } : null,
        errors: results.errors,
      }),
    };
  } catch (error: any) {
    console.error('Scheduled sync error:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message || 'Scheduled sync failed',
        timestamp: new Date().toISOString(),
      }),
    };
  }
};

export { handler };
