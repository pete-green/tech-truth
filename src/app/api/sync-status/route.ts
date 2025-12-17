import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET - Get sync status for all data sources
 * Returns last successful sync time and any recent failures
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const technicianId = searchParams.get('technicianId');
  const date = searchParams.get('date');

  try {
    // Get last sync logs for each type
    const syncTypes = ['paylocity_punches', 'arrival_detection', 'daily_arrival_check'];

    const { data: syncLogs, error: syncError } = await supabase
      .from('sync_logs')
      .select('*')
      .in('sync_type', syncTypes)
      .order('started_at', { ascending: false })
      .limit(50);

    if (syncError) {
      throw new Error(`Failed to fetch sync logs: ${syncError.message}`);
    }

    // Group by sync type and get latest for each
    const latestByType: Record<string, any> = {};
    const failuresByType: Record<string, any[]> = {};

    for (const log of syncLogs || []) {
      if (!latestByType[log.sync_type]) {
        latestByType[log.sync_type] = log;
      }
      if (log.status === 'failed') {
        if (!failuresByType[log.sync_type]) {
          failuresByType[log.sync_type] = [];
        }
        if (failuresByType[log.sync_type].length < 5) {
          failuresByType[log.sync_type].push(log);
        }
      }
    }

    // Check for punch data availability for specific technician/date
    let punchDataStatus = null;
    if (technicianId && date) {
      const { data: punches, error: punchError } = await supabase
        .from('punch_records')
        .select('id, punch_type, punch_time')
        .eq('technician_id', technicianId)
        .eq('punch_date', date);

      if (!punchError) {
        const hasClockIn = punches?.some(p => p.punch_type === 'ClockIn');
        const hasClockOut = punches?.some(p => p.punch_type === 'ClockOut');

        punchDataStatus = {
          date,
          technicianId,
          hasPunchData: (punches?.length || 0) > 0,
          hasClockIn,
          hasClockOut,
          punchCount: punches?.length || 0,
        };
      }
    }

    // Calculate overall health
    const paylocitySync = latestByType['paylocity_punches'];
    const arrivalSync = latestByType['arrival_detection'] || latestByType['daily_arrival_check'];

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const syncHealth = {
      paylocity: {
        lastSync: paylocitySync?.completed_at || paylocitySync?.started_at,
        status: paylocitySync?.status || 'never_run',
        isHealthy: paylocitySync?.status === 'completed' &&
                   paylocitySync?.completed_at &&
                   new Date(paylocitySync.completed_at) > oneDayAgo,
        lastError: paylocitySync?.status === 'failed' ? paylocitySync?.errors?.[0] : null,
        recentFailures: failuresByType['paylocity_punches']?.length || 0,
      },
      arrival: {
        lastSync: arrivalSync?.completed_at || arrivalSync?.started_at,
        status: arrivalSync?.status || 'never_run',
        isHealthy: arrivalSync?.status === 'completed' &&
                   arrivalSync?.completed_at &&
                   new Date(arrivalSync.completed_at) > oneHourAgo,
        lastError: arrivalSync?.status === 'failed' ? arrivalSync?.errors?.[0] : null,
      },
    };

    return NextResponse.json({
      success: true,
      syncHealth,
      punchDataStatus,
      latestSyncs: latestByType,
      recentFailures: failuresByType,
    });
  } catch (error) {
    console.error('Error fetching sync status:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
