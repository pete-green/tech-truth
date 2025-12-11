import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';

/**
 * Scheduled function to sync technician arrival data
 * Runs every 15 minutes during work hours (6 AM - 6 PM EST, Mon-Fri)
 *
 * Configure in netlify.toml:
 * [functions."scheduled-sync"]
 *   schedule = "*/15 6-18 * * 1-5"
 */

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  console.log('Scheduled sync triggered at:', new Date().toISOString());

  // Get the base URL from environment or construct it
  const baseUrl = process.env.URL || process.env.DEPLOY_URL || 'https://tech-truth.netlify.app';
  const syncUrl = `${baseUrl}/api/sync-data`;

  try {
    // Call the sync API endpoint
    const response = await fetch(syncUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        date: new Date().toISOString().split('T')[0], // Today's date
        firstJobOnly: true,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Sync API error:', data);
      return {
        statusCode: response.status,
        body: JSON.stringify({
          error: data.error || 'Sync failed',
          timestamp: new Date().toISOString(),
        }),
      };
    }

    console.log('Sync completed successfully:', data.summary);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Scheduled sync completed',
        timestamp: new Date().toISOString(),
        summary: data.summary,
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
