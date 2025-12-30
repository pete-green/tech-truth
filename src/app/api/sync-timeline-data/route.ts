import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getAppointments, getTechnicians } from '@/lib/service-titan';
import { getVehicleSegments } from '@/lib/verizon-connect';
import { getCompanyPunchDetails } from '@/lib/paylocity';
import { format, parseISO } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';

export const maxDuration = 60;

const EST_TIMEZONE = 'America/New_York';

interface SyncResult {
  gps: { synced: number; errors: string[] };
  jobs: { synced: number; errors: string[] };
  punches: { synced: number; errors: string[] };
}

/**
 * Sync all data sources for a specific technician and date
 * This ensures the timeline has fresh data from GPS, Service Titan, and Paylocity
 */
export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const startTime = Date.now();

  try {
    const body = await req.json();
    const { technicianId, date } = body;

    if (!technicianId || !date) {
      return NextResponse.json(
        { error: 'technicianId and date are required' },
        { status: 400 }
      );
    }

    const dateStr = format(parseISO(date), 'yyyy-MM-dd');
    console.log(`[Sync Timeline] Starting sync for tech ${technicianId} on ${dateStr}`);

    // Get technician info
    const { data: technician, error: techError } = await supabase
      .from('technicians')
      .select('id, name, st_technician_id, verizon_vehicle_id, paylocity_employee_id')
      .eq('id', technicianId)
      .single();

    if (techError || !technician) {
      return NextResponse.json(
        { error: 'Technician not found' },
        { status: 404 }
      );
    }

    const result: SyncResult = {
      gps: { synced: 0, errors: [] },
      jobs: { synced: 0, errors: [] },
      punches: { synced: 0, errors: [] },
    };

    // Run all syncs in parallel for speed
    const [gpsResult, jobsResult, punchesResult] = await Promise.allSettled([
      syncGPSData(supabase, technician, dateStr),
      syncJobsData(supabase, technician, dateStr),
      syncPunchData(supabase, technician, dateStr),
    ]);

    // Process GPS results
    if (gpsResult.status === 'fulfilled') {
      result.gps = gpsResult.value;
    } else {
      result.gps.errors.push(gpsResult.reason?.message || 'GPS sync failed');
    }

    // Process Jobs results
    if (jobsResult.status === 'fulfilled') {
      result.jobs = jobsResult.value;
    } else {
      result.jobs.errors.push(jobsResult.reason?.message || 'Jobs sync failed');
    }

    // Process Punches results
    if (punchesResult.status === 'fulfilled') {
      result.punches = punchesResult.value;
    } else {
      result.punches.errors.push(punchesResult.reason?.message || 'Punches sync failed');
    }

    const elapsed = Date.now() - startTime;
    console.log(`[Sync Timeline] Completed in ${elapsed}ms:`, result);

    return NextResponse.json({
      success: true,
      technicianId,
      date: dateStr,
      result,
      elapsedMs: elapsed,
    });

  } catch (error: any) {
    console.error('[Sync Timeline] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Sync failed' },
      { status: 500 }
    );
  }
}

/**
 * Sync GPS segments for a specific technician and date
 */
async function syncGPSData(
  supabase: any,
  technician: any,
  dateStr: string
): Promise<{ synced: number; errors: string[] }> {
  const errors: string[] = [];
  let synced = 0;

  if (!technician.verizon_vehicle_id) {
    return { synced: 0, errors: ['No vehicle assigned'] };
  }

  try {
    console.log(`[GPS Sync] Fetching segments for vehicle ${technician.verizon_vehicle_id} on ${dateStr}`);

    const segmentsResponse = await getVehicleSegments(technician.verizon_vehicle_id, dateStr);
    const segments = segmentsResponse?.Segments || [];

    if (segments.length === 0) {
      console.log(`[GPS Sync] No segments found for ${technician.name} on ${dateStr}`);
      return { synced: 0, errors: [] };
    }

    // Upsert segments to database
    for (const segment of segments) {
      // Build full address from location components
      const buildAddress = (loc: any) => {
        if (!loc) return null;
        const parts = [loc.AddressLine1, loc.Locality, loc.AdministrativeArea].filter(Boolean);
        return parts.join(', ') || null;
      };

      const segmentRow = {
        vehicle_id: technician.verizon_vehicle_id,
        technician_id: technician.id,
        segment_date: dateStr,
        start_time: segment.StartDateUtc,
        end_time: segment.EndDateUtc || null,
        is_complete: segment.IsComplete,
        start_latitude: segment.StartLocation?.Latitude || null,
        start_longitude: segment.StartLocation?.Longitude || null,
        start_address: buildAddress(segment.StartLocation),
        end_latitude: segment.EndLocation?.Latitude || null,
        end_longitude: segment.EndLocation?.Longitude || null,
        end_address: buildAddress(segment.EndLocation),
        distance_miles: segment.DistanceKilometers ? segment.DistanceKilometers * 0.621371 : null,
        raw_segment: segment,
      };

      const { error } = await supabase
        .from('gps_segments')
        .upsert(segmentRow, {
          onConflict: 'vehicle_id,start_time',
          ignoreDuplicates: false,
        });

      if (error) {
        errors.push(`Segment upsert error: ${error.message}`);
      } else {
        synced++;
      }
    }

    console.log(`[GPS Sync] Synced ${synced} segments for ${technician.name}`);
  } catch (error: any) {
    errors.push(error.message || 'GPS sync error');
  }

  return { synced, errors };
}

/**
 * Sync Service Titan jobs for a specific technician and date
 */
async function syncJobsData(
  supabase: any,
  technician: any,
  dateStr: string
): Promise<{ synced: number; errors: string[] }> {
  const errors: string[] = [];
  let synced = 0;

  if (!technician.st_technician_id) {
    return { synced: 0, errors: ['No Service Titan ID'] };
  }

  try {
    // Create date boundaries in EST
    const startsOnOrAfter = fromZonedTime(`${dateStr}T00:00:00`, EST_TIMEZONE).toISOString();
    const startsBefore = fromZonedTime(`${dateStr}T23:59:59`, EST_TIMEZONE).toISOString();

    console.log(`[Jobs Sync] Fetching appointments for tech ${technician.st_technician_id} on ${dateStr}`);

    // Fetch appointments for this tech on this date
    const appointmentsResult = await getAppointments({
      startsOnOrAfter,
      startsBefore,
      technicianId: technician.st_technician_id,
      pageSize: 100,
    });

    const appointments = appointmentsResult.data || [];

    if (appointments.length === 0) {
      console.log(`[Jobs Sync] No appointments found for ${technician.name} on ${dateStr}`);
      return { synced: 0, errors: [] };
    }

    // Upsert jobs to database
    for (const appt of appointments) {
      const jobRow = {
        st_job_id: appt.jobId || appt.id,
        st_appointment_id: appt.id,
        technician_id: technician.id,
        job_number: appt.jobNumber || String(appt.jobId || appt.id),
        customer_name: appt.customerName || appt.customer?.name || null,
        job_type: appt.type || appt.jobTypeName || null,
        scheduled_start: appt.start,
        scheduled_end: appt.end || null,
        actual_arrival: appt.arrivalWindowStart || null,
        job_address: appt.address || null,
        job_latitude: appt.latitude || null,
        job_longitude: appt.longitude || null,
        job_date: dateStr,
        status: appt.status || null,
      };

      const { error } = await supabase
        .from('jobs')
        .upsert(jobRow, {
          onConflict: 'st_appointment_id',
          ignoreDuplicates: false,
        });

      if (error) {
        errors.push(`Job upsert error: ${error.message}`);
      } else {
        synced++;
      }
    }

    console.log(`[Jobs Sync] Synced ${synced} jobs for ${technician.name}`);
  } catch (error: any) {
    errors.push(error.message || 'Jobs sync error');
  }

  return { synced, errors };
}

/**
 * Sync Paylocity punch data for a specific technician and date
 */
async function syncPunchData(
  supabase: any,
  technician: any,
  dateStr: string
): Promise<{ synced: number; errors: string[] }> {
  const errors: string[] = [];
  let synced = 0;

  if (!technician.paylocity_employee_id) {
    return { synced: 0, errors: ['No Paylocity employee ID'] };
  }

  try {
    console.log(`[Punch Sync] Fetching punches for employee ${technician.paylocity_employee_id} on ${dateStr}`);

    // Fetch punches from Paylocity for this date (need start and end date)
    const punches = await getCompanyPunchDetails(dateStr, dateStr);

    if (!punches || punches.length === 0) {
      console.log(`[Punch Sync] No punches found for ${dateStr}`);
      return { synced: 0, errors: [] };
    }

    // Filter punches for this specific employee
    const techPunches = punches.filter(
      (p: any) => p.employeeId === technician.paylocity_employee_id
    );

    if (techPunches.length === 0) {
      console.log(`[Punch Sync] No punches found for ${technician.name} on ${dateStr}`);
      return { synced: 0, errors: [] };
    }

    // Upsert punches to database
    for (const punch of techPunches) {
      // Determine punch time - use clockIn or clockOut based on what's available
      const punchTime = punch.clockInTime || punch.clockOutTime;

      if (!punchTime) {
        errors.push(`Punch missing time for employee ${punch.employeeId}`);
        continue;
      }

      const punchRow = {
        paylocity_employee_id: punch.employeeId,
        technician_id: technician.id,
        punch_date: punch.punchDate || dateStr,
        punch_time: punchTime,
        punch_type: punch.punchType || (punch.clockInTime ? 'ClockIn' : 'ClockOut'),
        clock_in_time: punch.clockInTime || null,
        clock_out_time: punch.clockOutTime || null,
        origin: punch.origin || null,
        department: punch.costCenterCode || null,
      };

      const { error } = await supabase
        .from('punch_records')
        .upsert(punchRow, {
          onConflict: 'paylocity_employee_id,punch_time',
          ignoreDuplicates: false,
        });

      if (error) {
        errors.push(`Punch upsert error: ${error.message}`);
      } else {
        synced++;
      }
    }

    console.log(`[Punch Sync] Synced ${synced} punches for ${technician.name}`);
  } catch (error: any) {
    errors.push(error.message || 'Punch sync error');
  }

  return { synced, errors };
}
