import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getEstimates, ServiceTitanEstimate } from '@/lib/service-titan';
import { format, parseISO, differenceInMinutes } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';

// Items are embedded in estimate response, not fetched separately
interface EmbeddedEstimateItem {
  id: number;
  qty: number;
  sku?: {
    id: number;
    name: string;
    type: string;
  };
  total: number;
  unitRate: number;
  description: string;
}

export const maxDuration = 120; // 2 minutes for larger syncs

const EST_TIMEZONE = 'America/New_York';

interface EstimateRow {
  st_estimate_id: number;
  job_id: string | null;
  st_job_id: number;
  technician_id: string | null;
  estimate_number: string | null;
  name: string | null;
  status: string;
  is_sold: boolean;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  created_at_st: string;
  sold_at: string | null;
  minutes_from_arrival_to_creation: number | null;
  minutes_from_arrival_to_sale: number | null;
  sold_by_technician_id: string | null;
  sold_by_name: string | null;
  raw_data: any;
}

interface EstimateItemRow {
  estimate_id: string;
  st_item_id: number;
  sku_id: number | null;
  sku_name: string | null;
  description: string | null;
  quantity: number;
  unit_price: number | null;
  total_price: number | null;
  item_type: string | null;
  is_sold: boolean;
  raw_data: any;
}

/**
 * Sync estimates from ServiceTitan to Supabase
 * This syncs all estimates created or modified on the given date
 */
export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const startTime = Date.now();

  try {
    const body = await req.json().catch(() => ({}));
    const dateParam = body.date;
    const syncItems = body.syncItems !== false; // Default to syncing items

    // Default to today
    const targetDate = dateParam ? parseISO(dateParam) : new Date();
    const dateStr = format(targetDate, 'yyyy-MM-dd');

    console.log(`[Estimates Sync] Starting sync for ${dateStr}`);

    // Create sync log entry
    const { data: syncLog } = await supabase
      .from('sync_logs')
      .insert({
        sync_type: 'estimates',
        status: 'running',
        records_processed: 0,
      })
      .select()
      .single();

    // Build date range for ServiceTitan API (full day in EST)
    const dayStart = fromZonedTime(`${dateStr}T00:00:00`, EST_TIMEZONE);
    const dayEnd = fromZonedTime(`${dateStr}T23:59:59`, EST_TIMEZONE);

    // Fetch estimates modified on this date
    let allEstimates: ServiceTitanEstimate[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      console.log(`[Estimates Sync] Fetching page ${page}...`);

      const response = await getEstimates({
        modifiedOnOrAfter: dayStart.toISOString(),
        modifiedBefore: dayEnd.toISOString(),
        page,
        pageSize: 50,
      });

      const estimates = response.data || [];
      allEstimates = [...allEstimates, ...estimates];
      hasMore = response.hasMore || false;
      page++;

      // Safety limit
      if (page > 100) {
        console.warn('[Estimates Sync] Hit page limit, stopping pagination');
        break;
      }
    }

    console.log(`[Estimates Sync] Fetched ${allEstimates.length} estimates`);

    if (allEstimates.length === 0) {
      // Update sync log
      if (syncLog) {
        await supabase
          .from('sync_logs')
          .update({
            status: 'completed',
            records_processed: 0,
            completed_at: new Date().toISOString(),
          })
          .eq('id', syncLog.id);
      }

      return NextResponse.json({
        success: true,
        date: dateStr,
        summary: {
          estimatesFetched: 0,
          estimatesStored: 0,
          itemsStored: 0,
          errors: 0,
        },
      });
    }

    // Get all jobs for lookup (to calculate timing)
    const jobIds = [...new Set(allEstimates.map(e => e.jobId).filter(Boolean))];
    const { data: jobs } = await supabase
      .from('jobs')
      .select('id, st_job_id, actual_arrival, technician_id')
      .in('st_job_id', jobIds);

    const jobLookup = new Map(jobs?.map(j => [j.st_job_id, j]) || []);

    // Get technicians for lookup (to map soldBy)
    const { data: technicians } = await supabase
      .from('technicians')
      .select('id, st_technician_id, name');

    const techLookup = new Map(technicians?.map(t => [t.st_technician_id, t]) || []);

    const errors: { estimateId: number; error: string }[] = [];
    let estimatesStored = 0;
    let itemsStored = 0;

    // Process each estimate
    for (const estimate of allEstimates) {
      try {
        const job = jobLookup.get(estimate.jobId);
        const arrivalTime = job?.actual_arrival ? parseISO(job.actual_arrival) : null;
        const estimateCreatedTime = parseISO(estimate.createdOn);
        const estimateSoldTime = estimate.soldOn ? parseISO(estimate.soldOn) : null;

        // Calculate timing metrics
        let minutesToCreation: number | null = null;
        let minutesToSale: number | null = null;

        if (arrivalTime) {
          minutesToCreation = differenceInMinutes(estimateCreatedTime, arrivalTime);
          // If negative (estimate created before arrival), set to 0
          if (minutesToCreation < 0) minutesToCreation = 0;

          if (estimateSoldTime) {
            minutesToSale = differenceInMinutes(estimateSoldTime, arrivalTime);
            if (minutesToSale < 0) minutesToSale = 0;
          }
        }

        // Map soldBy to our technician
        let soldByTechId: string | null = null;
        if (estimate.soldBy?.id) {
          const soldByTech = techLookup.get(estimate.soldBy.id);
          soldByTechId = soldByTech?.id || null;
        }

        const estimateRow: EstimateRow = {
          st_estimate_id: estimate.id,
          job_id: job?.id || null,
          st_job_id: estimate.jobId,
          technician_id: job?.technician_id || null,
          estimate_number: estimate.jobNumber || null,
          name: estimate.name || null,
          status: estimate.status?.name || 'Unknown',
          is_sold: estimate.soldOn !== null,
          subtotal: estimate.subtotal || null,
          tax: estimate.tax || null,
          // Calculate total from subtotal + tax (ServiceTitan doesn't always provide total)
          total: (estimate.subtotal || 0) + (estimate.tax || 0),
          created_at_st: estimate.createdOn,
          sold_at: estimate.soldOn || null,
          minutes_from_arrival_to_creation: minutesToCreation,
          minutes_from_arrival_to_sale: minutesToSale,
          sold_by_technician_id: soldByTechId,
          sold_by_name: estimate.soldBy?.name || null,
          raw_data: estimate,
        };

        // Upsert estimate
        const { data: upsertedEstimate, error: upsertError } = await supabase
          .from('estimates')
          .upsert(estimateRow, {
            onConflict: 'st_estimate_id',
          })
          .select('id')
          .single();

        if (upsertError) {
          errors.push({ estimateId: estimate.id, error: upsertError.message });
          continue;
        }

        estimatesStored++;

        // Extract and store estimate items from the embedded items array
        if (syncItems && upsertedEstimate) {
          try {
            // Items are embedded in the estimate response, not a separate API call
            const items: EmbeddedEstimateItem[] = (estimate as any).items || [];

            if (items.length > 0) {
              // Delete existing items for this estimate (full refresh)
              await supabase
                .from('estimate_items')
                .delete()
                .eq('estimate_id', upsertedEstimate.id);

              const itemRows: EstimateItemRow[] = items.map(item => ({
                estimate_id: upsertedEstimate.id,
                st_item_id: item.id,
                sku_id: item.sku?.id || null,
                sku_name: item.sku?.name || null,
                description: item.description || null,
                quantity: item.qty || 1,
                unit_price: item.unitRate || null,
                total_price: item.total || null,
                item_type: item.sku?.type || null,
                is_sold: estimate.soldOn !== null, // Item is sold if estimate is sold
                raw_data: item,
              }));

              const { error: itemsError } = await supabase
                .from('estimate_items')
                .insert(itemRows);

              if (itemsError) {
                errors.push({ estimateId: estimate.id, error: `Items: ${itemsError.message}` });
              } else {
                itemsStored += items.length;
              }
            }
          } catch (itemsErr: any) {
            errors.push({ estimateId: estimate.id, error: `Items: ${itemsErr.message}` });
          }
        }
      } catch (estError: any) {
        errors.push({ estimateId: estimate.id, error: estError.message });
      }
    }

    const duration = Date.now() - startTime;

    // Update sync log
    if (syncLog) {
      await supabase
        .from('sync_logs')
        .update({
          status: errors.length > 0 ? 'completed_with_errors' : 'completed',
          records_processed: estimatesStored,
          errors: errors.length > 0 ? errors : null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', syncLog.id);
    }

    console.log(`[Estimates Sync] Complete: ${estimatesStored} estimates, ${itemsStored} items, ${errors.length} errors, ${duration}ms`);

    return NextResponse.json({
      success: true,
      date: dateStr,
      summary: {
        estimatesFetched: allEstimates.length,
        estimatesStored,
        itemsStored,
        errors: errors.length,
        durationMs: duration,
      },
      errors: errors.length > 0 ? errors : null,
    });
  } catch (error: any) {
    console.error('[Estimates Sync] Fatal error:', error);
    return NextResponse.json(
      { error: error.message || 'Estimates sync failed' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Estimates Sync endpoint. POST to trigger sync.',
    usage: {
      method: 'POST',
      body: {
        date: 'YYYY-MM-DD (optional, defaults to today)',
        syncItems: 'boolean (optional, default true - sync line items)',
      },
    },
  });
}
