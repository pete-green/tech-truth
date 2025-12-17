import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getCompanyPunchDetails, type PunchRecord } from '@/lib/paylocity';
import {
  determineLocationType,
} from '@/lib/punch-utils';
import { getVehicleGPSHistory, type GPSHistoryPoint } from '@/lib/verizon-connect';

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
 * Find the GPS location closest to a given time from GPS history points
 * GPS history gives us actual breadcrumb trail, not just stops
 */
function findLocationFromGPSHistory(
  gpsHistory: GPSHistoryPoint[],
  targetTime: Date,
  toleranceMs: number = 10 * 60 * 1000 // 10 minutes
): { latitude: number; longitude: number; address: string; timestamp: Date } | null {
  if (!gpsHistory || gpsHistory.length === 0) return null;

  const targetMs = targetTime.getTime();
  let closest: GPSHistoryPoint | null = null;
  let closestDistance = Infinity;

  for (const point of gpsHistory) {
    const pointTime = new Date(point.UpdateUtc).getTime();
    const distance = Math.abs(targetMs - pointTime);

    if (distance < closestDistance && distance <= toleranceMs) {
      closestDistance = distance;
      closest = point;
    }
  }

  if (!closest) return null;

  const address = [
    closest.Address.AddressLine1,
    closest.Address.Locality,
    closest.Address.AdministrativeArea,
  ].filter(Boolean).join(', ');

  return {
    latitude: closest.Latitude,
    longitude: closest.Longitude,
    address: address || 'Unknown',
    timestamp: new Date(closest.UpdateUtc),
  };
}

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
 * Logs sync status to sync_logs table for monitoring
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

    // Pre-process: Find the first clock-in and last clock-out time for each employee
    // This helps us identify lunch breaks vs start/end-of-day punches
    const firstClockInByEmployee = new Map<string, string>();
    const lastClockOutByEmployee = new Map<string, string>();
    for (const punch of punches) {
      if (punch.clockInTime) {
        const existing = firstClockInByEmployee.get(punch.employeeId);
        if (!existing || punch.clockInTime < existing) {
          firstClockInByEmployee.set(punch.employeeId, punch.clockInTime);
        }
      }
      if (punch.clockOutTime) {
        const existing = lastClockOutByEmployee.get(punch.employeeId);
        if (!existing || punch.clockOutTime > existing) {
          lastClockOutByEmployee.set(punch.employeeId, punch.clockOutTime);
        }
      }
    }

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

        // Check if this is a meal segment - handle differently
        const isMealSegment = punch.punchType?.toLowerCase() === 'meal';

        // Fetch GPS history for this technician's vehicle
        // Uses the breadcrumb trail API which gives actual location at each time point
        // Query window: 4 AM EST (9 AM UTC) to 5 AM EST next day (10 AM UTC)
        let gpsHistory: GPSHistoryPoint[] = [];
        try {
          const nextDate = new Date(date);
          nextDate.setDate(nextDate.getDate() + 1);
          const nextDateStr = nextDate.toISOString().split('T')[0];

          gpsHistory = await getVehicleGPSHistory(
            tech.verizon_vehicle_id,
            `${date}T09:00:00.000Z`,  // 4 AM EST = 9 AM UTC
            `${nextDateStr}T10:00:00.000Z`  // 5 AM EST next day = 10 AM UTC
          );
        } catch (gpsError) {
          console.warn(`GPS history fetch failed for ${tech.name}: ${gpsError}`);
        }

        // Determine GPS location at clock-in time using actual GPS breadcrumb data
        let gpsAtClockIn: { latitude: number; longitude: number; address: string; timestamp: Date } | null = null;
        let clockInLocationType = 'no_gps';

        if (punch.clockInTime && gpsHistory.length > 0) {
          // Convert Paylocity Eastern time to UTC for comparison
          const clockInEastern = toEasternTimestamp(punch.clockInTime);
          const clockInDate = new Date(clockInEastern!);
          gpsAtClockIn = findLocationFromGPSHistory(gpsHistory, clockInDate);

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
        // Only flag as violation if this is the FIRST clock-in of the day (not returning from lunch)
        // Skip violation checks for meal segments entirely
        let isViolation = false;
        let violationReason: string | null = null;
        let canBeExcused = false;
        let expectedLocationType = tech.takes_truck_home ? 'job' : 'office';
        const hasExcusedVisit = excusedTechIds.has(tech.id);

        // Check if this is the first clock-in of the day for this employee
        const firstClockIn = firstClockInByEmployee.get(punch.employeeId);
        const isFirstClockIn = firstClockIn === punch.clockInTime;

        // Skip violation checks for meal segments
        if (!isMealSegment && clockInLocationType !== 'no_gps' && clockInLocationType !== 'unknown') {
          if (tech.takes_truck_home) {
            // Only check for violations on the FIRST clock-in (start of day)
            // Mid-day clock-ins (returning from lunch) are not violations
            if (isFirstClockIn && clockInLocationType === 'home') {
              isViolation = true;
              violationReason = 'Clocked in at HOME instead of job site';
              canBeExcused = false;
            } else if (isFirstClockIn && clockInLocationType === 'office' && !hasExcusedVisit) {
              isViolation = true;
              violationReason = 'Clocked in at OFFICE - should go direct to job';
              canBeExcused = true; // Office visits can be excused
            }
          } else {
            // Should be at office - only check on first clock-in
            if (isFirstClockIn && clockInLocationType !== 'office') {
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

        // Upsert ClockIn record (or MealStart for meal segments)
        // Note: We use paylocity_employee_id,punch_time,punch_type as the conflict key
        // This allows a ClockOut and ClockIn at the same time (e.g., lunch break end/start)
        // For meal segments: clockInTime = when they went to lunch = MealStart
        const punchInType = isMealSegment ? 'MealStart' : 'ClockIn';
        const { error: clockInError } = await supabase
          .from('punch_records')
          .upsert({
            technician_id: tech.id,
            paylocity_employee_id: punch.employeeId,
            punch_date: punch.punchDate,
            punch_time: clockInTimestamp,
            punch_type: punchInType,
            gps_latitude: gpsAtClockIn?.latitude,
            gps_longitude: gpsAtClockIn?.longitude,
            gps_address: gpsAtClockIn?.address,
            gps_location_type: clockInLocationType,
            gps_timestamp: gpsAtClockIn?.timestamp?.toISOString(),
            gps_distance_from_punch_feet: 0, // Exact location from GPS history
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
            onConflict: 'paylocity_employee_id,punch_time,punch_type',
          });

        if (clockInError) {
          results.errors.push(`${tech.name} ClockIn: ${clockInError.message}`);
        } else {
          results.processed++;
        }

        // Create separate ClockOut record (or MealEnd for meal segments) if clock-out time exists
        // For meal segments: clockOutTime = when they came back from lunch = MealEnd
        const punchOutType = isMealSegment ? 'MealEnd' : 'ClockOut';
        if (clockOutTimestamp) {
          // Get GPS location at clock-out time using actual GPS breadcrumb data
          let gpsAtClockOut: { latitude: number; longitude: number; address: string; timestamp: Date } | null = null;
          let clockOutLocationType = 'no_gps';

          if (gpsHistory.length > 0) {
            // Convert Paylocity Eastern time to UTC for comparison
            const clockOutEastern = toEasternTimestamp(punch.clockOutTime!);
            const clockOutDate = new Date(clockOutEastern!);
            gpsAtClockOut = findLocationFromGPSHistory(gpsHistory, clockOutDate);

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
          // Only flag as violation if this is the LAST clock-out of the day (not a lunch break)
          // Skip violation checks for meal segments entirely
          let clockOutViolation = false;
          let clockOutViolationReason: string | null = null;

          // Check if this is the last clock-out of the day for this employee
          const lastClockOut = lastClockOutByEmployee.get(punch.employeeId);
          const isLastClockOut = lastClockOut === punch.clockOutTime;

          // Skip violation checks for meal segments
          if (!isMealSegment && clockOutLocationType !== 'no_gps' && clockOutLocationType !== 'unknown') {
            // Only check for violations on the LAST clock-out (end of day)
            // Mid-day clock-outs (lunch breaks) are not violations
            if (isLastClockOut && tech.takes_truck_home && clockOutLocationType === 'home') {
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
              punch_type: punchOutType,
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
              onConflict: 'paylocity_employee_id,punch_time,punch_type',
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
