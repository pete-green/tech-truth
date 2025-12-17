import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getCompanyPunchDetails, type PunchRecord } from '@/lib/paylocity';
import {
  processDayPunches,
  findLocationAtTime,
  determineLocationType,
  type TechnicianConfig,
  type DayPunchSummary,
} from '@/lib/punch-utils';
import { getVehicleSegments, type VehicleSegment } from '@/lib/verizon-connect';

/**
 * Convert Paylocity local time (Eastern) to proper ISO timestamp with timezone
 * Paylocity returns times like "2025-12-15T08:00:00" which is Eastern Time
 */
function toEasternTimestamp(localTime: string | null): string | null {
  if (!localTime) return null;

  // Parse the date to determine if it's DST or standard time
  const date = new Date(localTime);
  const month = date.getMonth(); // 0-11
  const day = date.getDate();

  // DST in US: Second Sunday in March to First Sunday in November
  // Simplified check: March 8-Nov 1 is roughly DST (EDT = -04:00)
  // Otherwise EST = -05:00
  let offset = '-05:00'; // EST (standard)

  if (month > 2 && month < 10) {
    // April through October - definitely EDT
    offset = '-04:00';
  } else if (month === 2 && day >= 8) {
    // March after 8th - likely EDT (could be more precise but this is close enough)
    offset = '-04:00';
  } else if (month === 10 && day < 7) {
    // First week of November - might still be EDT
    offset = '-04:00';
  }

  // If the time already has timezone info, return as-is
  if (localTime.includes('+') || localTime.includes('Z') || localTime.match(/\d{2}:\d{2}:\d{2}[+-]/)) {
    return localTime;
  }

  // Append the Eastern timezone offset
  return `${localTime}${offset}`;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Office location (Go Green headquarters)
const OFFICE_LOCATION = {
  lat: 36.0952,
  lon: -79.8273,
};

/**
 * GET - Fetch punch violations for a date
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

  try {
    // Fetch punch records from database
    const { data: punchRecords, error } = await supabase
      .from('punch_records')
      .select('*')
      .eq('punch_date', date)
      .order('technician_id');

    if (error) {
      throw new Error(`Failed to fetch punch records: ${error.message}`);
    }

    // Get technician names
    const techIds = [...new Set(punchRecords?.map(p => p.technician_id).filter(Boolean))];
    const { data: technicians } = await supabase
      .from('technicians')
      .select('id, name')
      .in('id', techIds);

    const techMap = new Map(technicians?.map(t => [t.id, t.name]) || []);

    // Add technician names to punch records
    const recordsWithNames = punchRecords?.map(p => ({
      ...p,
      technician_name: techMap.get(p.technician_id) || 'Unknown',
    }));

    // Separate violations
    const violations = recordsWithNames?.filter(p => p.is_violation) || [];

    return NextResponse.json({
      success: true,
      date,
      total_records: punchRecords?.length || 0,
      violations_count: violations.length,
      punch_records: recordsWithNames,
      violations,
    });
  } catch (error) {
    console.error('Error fetching punch data:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * POST - Sync punch data from Paylocity for a date
 */
export async function POST(request: Request) {
  let syncLogId: string | null = null;

  try {
    const body = await request.json();
    const date = body.date || new Date().toISOString().split('T')[0];

    console.log(`Starting punch sync for ${date}...`);

    // Create sync log entry
    const { data: syncLog, error: syncLogError } = await supabase
      .from('sync_logs')
      .insert({
        sync_type: 'paylocity_punches',
        status: 'running',
        records_processed: 0,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (syncLogError) {
      console.warn('Failed to create sync log:', syncLogError);
    } else {
      syncLogId = syncLog.id;
    }

    // Step 1: Fetch technicians with Paylocity IDs and GPS vehicle IDs
    const { data: technicians, error: techError } = await supabase
      .from('technicians')
      .select(`
        id,
        name,
        paylocity_employee_id,
        takes_truck_home,
        home_latitude,
        home_longitude,
        verizon_vehicle_id
      `)
      .not('paylocity_employee_id', 'is', null);

    if (techError) {
      throw new Error(`Failed to fetch technicians: ${techError.message}`);
    }

    console.log(`Found ${technicians?.length || 0} technicians with Paylocity IDs`);

    // Create lookup by Paylocity employee ID
    const techByPaylocityId = new Map(
      technicians?.map(t => [t.paylocity_employee_id, t]) || []
    );

    // Step 2: Fetch punch data from Paylocity
    const startDate = `${date}T00:00:00`;
    const endDate = `${date}T23:59:59`;
    const punches = await getCompanyPunchDetails(startDate, endDate);

    console.log(`Fetched ${punches.length} punch records from Paylocity`);

    // Step 3: Fetch custom locations
    const { data: customLocations } = await supabase
      .from('custom_locations')
      .select('*');

    // Step 4: Fetch excused office visits for the date
    const { data: excusedVisits } = await supabase
      .from('excused_office_visits')
      .select('technician_id')
      .eq('visit_date', date);

    const excusedTechIds = new Set(excusedVisits?.map(v => v.technician_id) || []);

    // Step 5: Fetch jobs for the date to get job locations
    const { data: jobs } = await supabase
      .from('jobs')
      .select('job_date, latitude, longitude, address')
      .eq('job_date', date)
      .not('latitude', 'is', null);

    const jobLocations = jobs?.map(j => ({
      lat: j.latitude,
      lon: j.longitude,
      address: j.address,
    })) || [];

    // Step 6: Process each punch and correlate with GPS
    const results = {
      processed: 0,
      matched: 0,
      violations: 0,
      skipped: 0,
      missingClockOuts: 0,
      clockOutsCreated: 0,
      errors: [] as string[],
    };

    for (const punch of punches) {
      try {
        // Find technician for this Paylocity employee
        const tech = techByPaylocityId.get(punch.employeeId);
        if (!tech) {
          results.skipped++;
          continue;
        }

        // Skip if no GPS vehicle
        if (!tech.verizon_vehicle_id) {
          results.skipped++;
          continue;
        }

        results.matched++;

        // Fetch GPS history for this technician's vehicle
        // Use full day window to capture all segments including late arrivals
        let gpsSegments: VehicleSegment[] = [];
        try {
          const segmentsResponse = await getVehicleSegments(
            tech.verizon_vehicle_id,
            `${date}T00:00:00Z`,
            `${date}T23:59:59Z`
          );
          gpsSegments = segmentsResponse?.Segments || [];
        } catch (gpsError) {
          console.warn(`GPS fetch failed for ${tech.name}: ${gpsError}`);
        }

        // Determine GPS location at clock-in time
        let gpsAtClockIn = null;
        let clockInLocationType = 'no_gps';
        let gpsDistanceFeet = 0;

        if (punch.clockInTime && gpsSegments.length > 0) {
          const clockInDate = new Date(punch.clockInTime);
          gpsAtClockIn = findLocationAtTime(gpsSegments, clockInDate);

          if (gpsAtClockIn) {
            const homeLocation = tech.home_latitude && tech.home_longitude
              ? { lat: tech.home_latitude, lon: tech.home_longitude }
              : null;

            clockInLocationType = determineLocationType(
              gpsAtClockIn.latitude,
              gpsAtClockIn.longitude,
              OFFICE_LOCATION,
              homeLocation,
              customLocations || [],
              jobLocations
            );
          }
        }

        // Check for clock-in violation
        let isViolation = false;
        let violationReason: string | null = null;
        let canBeExcused = false;
        let expectedLocationType = tech.takes_truck_home ? 'job' : 'office';
        const hasExcusedVisit = excusedTechIds.has(tech.id);

        if (clockInLocationType !== 'no_gps' && clockInLocationType !== 'unknown') {
          if (tech.takes_truck_home) {
            // Should be at job, unless excused office visit
            if (clockInLocationType === 'home') {
              isViolation = true;
              violationReason = 'Clocked in at HOME instead of job site';
              canBeExcused = false;
            } else if (clockInLocationType === 'office' && !hasExcusedVisit) {
              isViolation = true;
              violationReason = 'Clocked in at OFFICE - should go direct to job';
              canBeExcused = true; // Office visits can be excused
            }
          } else {
            // Should be at office
            if (clockInLocationType !== 'office') {
              isViolation = true;
              violationReason = `Clocked in at ${clockInLocationType.toUpperCase()} instead of office`;
              canBeExcused = false;
            }
          }
        }

        if (isViolation) results.violations++;

        // Convert Paylocity local times to proper Eastern timestamps
        const clockInTimestamp = toEasternTimestamp(punch.clockInTime);
        const clockOutTimestamp = toEasternTimestamp(punch.clockOutTime);

        // Track missing clock-outs
        if (clockInTimestamp && !clockOutTimestamp) {
          results.missingClockOuts++;
        }

        // Upsert ClockIn record
        const { error: clockInError } = await supabase
          .from('punch_records')
          .upsert({
            technician_id: tech.id,
            paylocity_employee_id: punch.employeeId,
            punch_date: punch.punchDate,
            punch_time: clockInTimestamp,
            punch_type: 'ClockIn',
            gps_latitude: gpsAtClockIn?.latitude,
            gps_longitude: gpsAtClockIn?.longitude,
            gps_address: gpsAtClockIn?.address,
            gps_location_type: clockInLocationType,
            gps_timestamp: gpsAtClockIn?.timestamp?.toISOString(),
            gps_distance_from_punch_feet: gpsDistanceFeet,
            is_violation: isViolation,
            violation_reason: violationReason,
            expected_location_type: expectedLocationType,
            can_be_excused: canBeExcused,
            clock_in_time: clockInTimestamp,
            clock_out_time: clockOutTimestamp,
            duration_hours: punch.durationHours,
            origin: punch.origin,
            cost_center_name: punch.costCenterName,
          }, {
            onConflict: 'paylocity_employee_id,punch_time',
          });

        if (clockInError) {
          results.errors.push(`${tech.name} ClockIn: ${clockInError.message}`);
        } else {
          results.processed++;
        }

        // Create separate ClockOut record if clock-out time exists
        if (clockOutTimestamp) {
          // Get GPS location at clock-out time
          let gpsAtClockOut = null;
          let clockOutLocationType = 'no_gps';

          if (gpsSegments.length > 0) {
            const clockOutDate = new Date(punch.clockOutTime!);
            gpsAtClockOut = findLocationAtTime(gpsSegments, clockOutDate);

            if (gpsAtClockOut) {
              const homeLocation = tech.home_latitude && tech.home_longitude
                ? { lat: tech.home_latitude, lon: tech.home_longitude }
                : null;

              clockOutLocationType = determineLocationType(
                gpsAtClockOut.latitude,
                gpsAtClockOut.longitude,
                OFFICE_LOCATION,
                homeLocation,
                customLocations || [],
                jobLocations
              );
            }
          }

          // Check for clock-out violations (clocking out at home instead of job/office)
          let clockOutViolation = false;
          let clockOutViolationReason: string | null = null;

          if (clockOutLocationType !== 'no_gps' && clockOutLocationType !== 'unknown') {
            if (tech.takes_truck_home && clockOutLocationType === 'home') {
              clockOutViolation = true;
              clockOutViolationReason = 'Clocked out at HOME - should clock out when leaving last job';
            }
          }

          if (clockOutViolation) results.violations++;

          const { error: clockOutError } = await supabase
            .from('punch_records')
            .upsert({
              technician_id: tech.id,
              paylocity_employee_id: punch.employeeId,
              punch_date: punch.punchDate,
              punch_time: clockOutTimestamp,
              punch_type: 'ClockOut',
              gps_latitude: gpsAtClockOut?.latitude,
              gps_longitude: gpsAtClockOut?.longitude,
              gps_address: gpsAtClockOut?.address,
              gps_location_type: clockOutLocationType,
              gps_timestamp: gpsAtClockOut?.timestamp?.toISOString(),
              gps_distance_from_punch_feet: 0,
              is_violation: clockOutViolation,
              violation_reason: clockOutViolationReason,
              expected_location_type: tech.takes_truck_home ? 'job' : 'office',
              can_be_excused: false,
              clock_in_time: clockInTimestamp,
              clock_out_time: clockOutTimestamp,
              duration_hours: punch.durationHours,
              origin: punch.origin,
              cost_center_name: punch.costCenterName,
            }, {
              onConflict: 'paylocity_employee_id,punch_time',
            });

          if (clockOutError) {
            results.errors.push(`${tech.name} ClockOut: ${clockOutError.message}`);
          } else {
            results.clockOutsCreated++;
          }
        }
      } catch (punchError) {
        results.errors.push(`Processing error: ${punchError}`);
      }
    }

    console.log(`Punch sync complete: ${JSON.stringify(results)}`);

    // Update sync log with success
    if (syncLogId) {
      await supabase
        .from('sync_logs')
        .update({
          status: 'completed',
          records_processed: results.processed,
          errors: results.errors.length > 0 ? results.errors : null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', syncLogId);
    }

    return NextResponse.json({
      success: true,
      date,
      ...results,
    });
  } catch (error) {
    console.error('Error syncing punch data:', error);

    // Update sync log with failure
    if (syncLogId) {
      await supabase
        .from('sync_logs')
        .update({
          status: 'failed',
          errors: [error instanceof Error ? error.message : 'Unknown error'],
          completed_at: new Date().toISOString(),
        })
        .eq('id', syncLogId);
    }

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
