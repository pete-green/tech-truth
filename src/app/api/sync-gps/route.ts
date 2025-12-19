import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getVehicleSegments, VehicleSegment } from '@/lib/verizon-connect';
import { format, subDays, parseISO, addDays } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';

export const maxDuration = 60;

const EST_TIMEZONE = 'America/New_York';

interface GPSSegmentRow {
  vehicle_id: string;
  technician_id: string;
  segment_date: string;
  start_time: string;
  end_time: string | null;
  is_complete: boolean;
  start_latitude: number;
  start_longitude: number;
  start_address: string | null;
  end_latitude: number | null;
  end_longitude: number | null;
  end_address: string | null;
  distance_miles: number | null;
  duration_minutes: number | null;
  idle_minutes: number | null;
  max_speed: number | null;
  raw_segment: any;
}

interface GPSEvent {
  technician_id: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  speed: number | null;
  heading: number | null;
  address: string | null;
  event_type: 'segment_start' | 'segment_end' | 'location_update';
  segment_id?: string;
}

/**
 * Dedicated GPS sync endpoint that continuously collects and stores GPS data
 * This should run every 15 minutes to maintain comprehensive GPS history
 */
export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const startTime = Date.now();

  try {
    const body = await req.json().catch(() => ({}));
    const dateParam = body.date;
    const forceFullSync = body.forceFullSync === true;

    // Default to today
    const targetDate = dateParam ? parseISO(dateParam) : new Date();
    const dateStr = format(targetDate, 'yyyy-MM-dd');

    console.log(`[GPS Sync] Starting GPS sync for ${dateStr}`);

    // Create sync log entry
    const { data: syncLog } = await supabase
      .from('sync_logs')
      .insert({
        sync_type: 'gps_collection',
        status: 'running',
        records_processed: 0,
      })
      .select()
      .single();

    // Get all technicians with vehicles assigned
    const { data: technicians, error: techError } = await supabase
      .from('technicians')
      .select('id, name, verizon_vehicle_id')
      .not('verizon_vehicle_id', 'is', null)
      .eq('active', true);

    if (techError) throw techError;

    console.log(`[GPS Sync] Found ${technicians?.length || 0} technicians with vehicles`);

    const errors: { tech: string; vehicleId: string; error: string }[] = [];
    let totalEventsInserted = 0;
    let totalSegmentsFetched = 0;
    let totalSegmentsStored = 0;

    // Time window: 4 AM EST day-of to 5 AM EST next day
    // This captures early morning starts and late night returns home
    const dayStartUtc = fromZonedTime(`${dateStr}T04:00:00`, EST_TIMEZONE).toISOString();
    const nextDay = format(addDays(targetDate, 1), 'yyyy-MM-dd');
    const dayEndUtc = fromZonedTime(`${nextDay}T05:00:00`, EST_TIMEZONE).toISOString();

    for (const tech of technicians || []) {
      if (!tech.verizon_vehicle_id) continue;

      try {
        console.log(`[GPS Sync] Fetching segments for ${tech.name} (vehicle ${tech.verizon_vehicle_id})`);

        const segmentsResponse = await getVehicleSegments(
          tech.verizon_vehicle_id,
          dayStartUtc,
          dayEndUtc
        );

        const segments = segmentsResponse?.Segments || [];
        totalSegmentsFetched += segments.length;

        if (segments.length === 0) {
          console.log(`[GPS Sync] No segments for ${tech.name}`);
          continue;
        }

        console.log(`[GPS Sync] ${tech.name}: ${segments.length} segments`);

        // Store full segments to gps_segments table for reliable timeline building
        const segmentRows: GPSSegmentRow[] = [];

        for (const segment of segments) {
          if (!segment.StartLocation || !segment.StartDateUtc) continue;

          const startTimestamp = segment.StartDateUtc.includes('Z')
            ? segment.StartDateUtc
            : segment.StartDateUtc + 'Z';

          const endTimestamp = segment.EndDateUtc
            ? (segment.EndDateUtc.includes('Z') ? segment.EndDateUtc : segment.EndDateUtc + 'Z')
            : null;

          const formatAddress = (loc: any) => {
            if (!loc) return null;
            return [loc.AddressLine1, loc.Locality, loc.AdministrativeArea, loc.PostalCode]
              .filter(Boolean).join(', ') || null;
          };

          // Calculate duration in minutes
          let durationMinutes: number | null = null;
          if (startTimestamp && endTimestamp) {
            durationMinutes = Math.round(
              (new Date(endTimestamp).getTime() - new Date(startTimestamp).getTime()) / 60000
            );
          }

          // Access raw segment properties (API may return more than typed interface)
          const rawSeg = segment as any;
          const distanceKm = segment.DistanceKilometers || rawSeg.DistanceKilometers || 0;
          const distanceMiles = distanceKm ? distanceKm * 0.621371 : (rawSeg.DistanceTraveled || null);

          segmentRows.push({
            vehicle_id: tech.verizon_vehicle_id,
            technician_id: tech.id,
            segment_date: dateStr,
            start_time: startTimestamp,
            end_time: endTimestamp,
            is_complete: segment.IsComplete || false,
            start_latitude: segment.StartLocation.Latitude,
            start_longitude: segment.StartLocation.Longitude,
            start_address: formatAddress(segment.StartLocation),
            end_latitude: segment.EndLocation?.Latitude || null,
            end_longitude: segment.EndLocation?.Longitude || null,
            end_address: formatAddress(segment.EndLocation),
            distance_miles: distanceMiles,
            duration_minutes: durationMinutes,
            idle_minutes: rawSeg.IdleTime ? Math.round(rawSeg.IdleTime / 60) : null,
            max_speed: rawSeg.MaxSpeed || null,
            raw_segment: segment,
          });
        }

        // Upsert segments (update if start_time matches, insert if new)
        if (segmentRows.length > 0) {
          const { error: segmentError } = await supabase
            .from('gps_segments')
            .upsert(segmentRows, {
              onConflict: 'vehicle_id,start_time',
            });

          if (segmentError) {
            console.error(`[GPS Sync] Segment storage error for ${tech.name}:`, segmentError.message);
            errors.push({
              tech: tech.name,
              vehicleId: tech.verizon_vehicle_id,
              error: `Segment storage: ${segmentError.message}`,
            });
          } else {
            totalSegmentsStored += segmentRows.length;
            console.log(`[GPS Sync] ${tech.name}: Stored ${segmentRows.length} segments to gps_segments`);
          }
        }

        // ALSO convert segments to GPS events (legacy support)
        const gpsEvents: GPSEvent[] = [];

        for (const segment of segments) {
          // Generate a unique segment ID for deduplication
          const segmentId = `${tech.verizon_vehicle_id}-${segment.StartDateUtc}`;

          // Add start location
          if (segment.StartLocation && segment.StartDateUtc) {
            const timestamp = segment.StartDateUtc.includes('Z')
              ? segment.StartDateUtc
              : segment.StartDateUtc + 'Z';

            const address = [
              segment.StartLocation.AddressLine1,
              segment.StartLocation.Locality,
              segment.StartLocation.AdministrativeArea,
              segment.StartLocation.PostalCode
            ].filter(Boolean).join(', ');

            gpsEvents.push({
              technician_id: tech.id,
              latitude: segment.StartLocation.Latitude,
              longitude: segment.StartLocation.Longitude,
              timestamp,
              speed: null,
              heading: null,
              address: address || null,
              event_type: 'segment_start',
              segment_id: segmentId,
            });
          }

          // Add end location (if segment is complete)
          if (segment.EndLocation && segment.EndDateUtc && segment.IsComplete) {
            const timestamp = segment.EndDateUtc.includes('Z')
              ? segment.EndDateUtc
              : segment.EndDateUtc + 'Z';

            const address = [
              segment.EndLocation.AddressLine1,
              segment.EndLocation.Locality,
              segment.EndLocation.AdministrativeArea,
              segment.EndLocation.PostalCode
            ].filter(Boolean).join(', ');

            gpsEvents.push({
              technician_id: tech.id,
              latitude: segment.EndLocation.Latitude,
              longitude: segment.EndLocation.Longitude,
              timestamp,
              speed: 0, // Stopped
              heading: null,
              address: address || null,
              event_type: 'segment_end',
              segment_id: segmentId,
            });
          }
        }

        // Batch upsert GPS events
        if (gpsEvents.length > 0) {
          // Use upsert with a composite key approach - insert and skip conflicts
          const { error: insertError, count } = await supabase
            .from('gps_events')
            .upsert(
              gpsEvents.map(e => ({
                technician_id: e.technician_id,
                latitude: e.latitude,
                longitude: e.longitude,
                timestamp: e.timestamp,
                speed: e.speed,
                heading: e.heading,
                address: e.address,
                event_type: e.event_type,
              })),
              {
                onConflict: 'technician_id,timestamp',
                ignoreDuplicates: true,
              }
            );

          if (insertError) {
            console.error(`[GPS Sync] Insert error for ${tech.name}:`, insertError.message);
            errors.push({
              tech: tech.name,
              vehicleId: tech.verizon_vehicle_id,
              error: insertError.message,
            });
          } else {
            totalEventsInserted += gpsEvents.length;
            console.log(`[GPS Sync] ${tech.name}: Inserted ${gpsEvents.length} GPS events`);
          }
        }
      } catch (techError: any) {
        console.error(`[GPS Sync] Error for ${tech.name}:`, techError.message);
        errors.push({
          tech: tech.name,
          vehicleId: tech.verizon_vehicle_id,
          error: techError.message,
        });
      }
    }

    const duration = Date.now() - startTime;

    // Update sync log
    if (syncLog) {
      await supabase
        .from('sync_logs')
        .update({
          status: errors.length > 0 ? 'completed_with_errors' : 'completed',
          records_processed: totalEventsInserted,
          errors: errors.length > 0 ? errors : null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', syncLog.id);
    }

    console.log(`[GPS Sync] Complete: ${totalSegmentsFetched} segments fetched, ${totalSegmentsStored} stored, ${totalEventsInserted} events, ${errors.length} errors, ${duration}ms`);

    return NextResponse.json({
      success: true,
      date: dateStr,
      summary: {
        techniciansProcessed: technicians?.length || 0,
        segmentsFetched: totalSegmentsFetched,
        segmentsStored: totalSegmentsStored,
        eventsInserted: totalEventsInserted,
        errors: errors.length,
        durationMs: duration,
      },
      errors: errors.length > 0 ? errors : null,
    });
  } catch (error: any) {
    console.error('[GPS Sync] Fatal error:', error);
    return NextResponse.json(
      { error: error.message || 'GPS sync failed' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'GPS Sync endpoint. POST to trigger sync.',
    usage: {
      method: 'POST',
      body: {
        date: 'YYYY-MM-DD (optional, defaults to today)',
        forceFullSync: 'boolean (optional, re-fetch all data)',
      },
    },
  });
}
