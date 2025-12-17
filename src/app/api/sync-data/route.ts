import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getTechnicians, getAppointments, getAppointmentAssignmentsByJobId, getJob, getLocation, getJobTypeWithCache } from '@/lib/service-titan';
import { getVehicleGPSData, getVehicleSegments, GPSHistoryPoint, VehicleSegment } from '@/lib/verizon-connect';
import { parseISO, differenceInMinutes, subMinutes, addHours, format } from 'date-fns';
import { toZonedTime, fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import { findArrivalTime, findArrivalFromSegments, ARRIVAL_RADIUS_FEET, detectOfficeVisits, TechOfficeConfig, geocodeAddress } from '@/lib/geo-utils';

export const maxDuration = 60; // Vercel/Netlify function timeout (up to 60s on pro)

// Business operates in Eastern Time
const EST_TIMEZONE = 'America/New_York';

interface ProcessingError {
  type: string;
  techName?: string;
  jobId?: number;
  vehicleId?: string;
  error: string;
  [key: string]: string | number | undefined; // Index signature for Json compatibility
}

interface SyncResult {
  techName: string;
  jobId: number;
  scheduledStart: string;
  actualArrival: string | null;
  varianceMinutes: number | null;
  isLate: boolean;
  jobAddress: string;
  distanceFromJob?: number;
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient();

  try {
    const body = await req.json();
    const dateParam = body.date;
    const firstJobOnly = body.firstJobOnly === true; // Default to false - sync ALL jobs

    // Default to today if no date provided
    // IMPORTANT: Use EST timezone for date boundaries since the business operates in Eastern Time
    const targetDate = dateParam ? parseISO(dateParam) : new Date();
    const dateStr = format(targetDate, 'yyyy-MM-dd');

    // Create EST midnight boundaries: e.g., Dec 10 00:00 EST to Dec 10 23:59:59 EST
    // fromZonedTime converts "this time in EST" to UTC
    const startsOnOrAfter = fromZonedTime(`${dateStr}T00:00:00`, EST_TIMEZONE).toISOString();
    const startsBefore = fromZonedTime(`${dateStr}T23:59:59`, EST_TIMEZONE).toISOString();

    console.log(`Starting sync for date: ${dateStr} (EST)`);
    console.log(`  Query window: ${startsOnOrAfter} to ${startsBefore}`);

    // Create sync log entry
    const { data: syncLog } = await supabase
      .from('sync_logs')
      .insert({
        sync_type: 'arrival_detection',
        status: 'running',
        records_processed: 0,
      })
      .select()
      .single();

    const errors: ProcessingError[] = [];
    const results: SyncResult[] = [];
    let recordsProcessed = 0;

    // Step 1: Quick sync of technicians
    console.log('Step 1: Syncing technicians...');
    const techResult = await getTechnicians({ active: true, pageSize: 200 });
    const stTechnicians = techResult.data || [];

    const techUpserts = stTechnicians.map((tech: any) => ({
      st_technician_id: tech.id,
      name: tech.name || `${tech.firstName || ''} ${tech.lastName || ''}`.trim(),
      email: tech.email || null,
      phone: tech.phone || tech.phoneNumber || null,
      active: tech.active !== false,
      updated_at: new Date().toISOString(),
    }));

    if (techUpserts.length > 0) {
      await supabase.from('technicians').upsert(techUpserts, { onConflict: 'st_technician_id' });
    }

    // Get technicians WITH trucks assigned from our database
    const { data: techsWithTrucks } = await supabase
      .from('technicians')
      .select('id, st_technician_id, name, verizon_vehicle_id, exclude_from_office_visits, takes_truck_home, home_latitude, home_longitude')
      .not('verizon_vehicle_id', 'is', null);

    const techLookup = new Map();
    for (const t of techsWithTrucks || []) {
      techLookup.set(t.st_technician_id, t);
    }

    console.log(`Found ${techsWithTrucks?.length || 0} technicians with trucks assigned`);

    // Step 2: Get APPOINTMENTS for the date (not appointment-assignments!)
    // This correctly filters by appointment start time
    console.log('Step 2: Getting appointments for the date...');
    const appointmentsResult = await getAppointments({
      startsOnOrAfter,
      startsBefore,
      pageSize: 200,
    });
    const appointments = appointmentsResult.data || [];
    console.log(`Found ${appointments.length} appointments for ${dateStr}`);

    // Step 3: For each appointment, get the tech assignment and process
    console.log('Step 3: Processing appointments with GPS verification...');

    // Group appointments by start time to identify first jobs
    // We'll track which techs we've already processed their first job
    const processedTechFirstJob = new Set<number>();
    // Track first job scheduled time per technician (for office visit classification)
    const techFirstJobTime = new Map<string, Date>(); // technician UUID -> first job scheduled time
    let jobsProcessed = 0;
    let discrepanciesFound = 0;

    // Sort appointments by start time
    const sortedAppointments = [...appointments].sort((a: any, b: any) =>
      new Date(a.start).getTime() - new Date(b.start).getTime()
    );

    for (const appointment of sortedAppointments) {
      try {
        // Skip canceled appointments - they never happened
        if (appointment.status === 'Canceled') {
          continue;
        }

        // Step 3a: Get the technician assignment for this job
        const assignmentResult = await getAppointmentAssignmentsByJobId(appointment.jobId);
        const assignments = assignmentResult.data || [];

        if (assignments.length === 0) {
          // No technician assigned to this job
          continue;
        }

        // Get ALL active assignments - a job may have multiple techs assigned
        // We need to find any tech that has a truck assigned in our system
        const activeAssignments = assignments.filter((a: any) => a.active);
        if (activeAssignments.length === 0 && assignments.length > 0) {
          // Fall back to first assignment if none are active
          activeAssignments.push(assignments[0]);
        }

        // Find the first assigned tech that has a truck in our system
        let techData = null;
        let stTechId = null;
        for (const assignment of activeAssignments) {
          const possibleTech = techLookup.get(assignment.technicianId);
          if (possibleTech) {
            techData = possibleTech;
            stTechId = assignment.technicianId;
            break;
          }
        }

        if (!techData) {
          // No assigned tech has a truck, skip this job
          continue;
        }

        const scheduledTime = new Date(appointment.start);

        // Step 3b: Get job details for location AND job type
        const jobDetails = await getJob(appointment.jobId);

        // Check if this is a follow-up job type
        // Follow-up jobs ARE still saved to the database, but don't count as "first job" for arrival tracking
        let isFollowUpJob = false;
        let jobTypeName = '';
        if (jobDetails.jobTypeId) {
          const jobType = await getJobTypeWithCache(jobDetails.jobTypeId);
          isFollowUpJob = jobType.isFollowUp;
          jobTypeName = jobType.name;
          if (isFollowUpJob) {
            console.log(`  Processing follow-up job: ${techData.name} - Job ${appointment.jobId} (${jobTypeName})`);
          }
        }

        // Determine if this is the first job for this technician
        // Follow-up jobs don't count as "first job" for arrival time tracking
        const isFirstJob = !isFollowUpJob && !processedTechFirstJob.has(stTechId);

        // Mark this tech's first job as being processed (only for non-follow-up jobs)
        if (isFirstJob) {
          processedTechFirstJob.add(stTechId);
          // Store first job scheduled time for office visit classification
          techFirstJobTime.set(techData.id, scheduledTime);
        }

        // If we only want first jobs and this isn't the first, skip (but still allow follow-up jobs to be saved)
        if (firstJobOnly && !isFirstJob && !isFollowUpJob) {
          continue;
        }

        if (!jobDetails.locationId) {
          errors.push({
            type: 'no_location',
            techName: techData.name,
            jobId: appointment.jobId,
            error: 'Job has no locationId',
          });
          continue;
        }

        // Step 3c: Get location with coordinates
        const location = await getLocation(jobDetails.locationId);
        const jobAddress = `${location.address?.street || ''}, ${location.address?.city || ''}, ${location.address?.state || ''} ${location.address?.zip || ''}`.trim();

        let jobLat = location.address?.latitude;
        let jobLon = location.address?.longitude;

        // If Service Titan doesn't have coordinates, try geocoding the address
        if (!jobLat || !jobLon) {
          console.log(`    No coordinates in ST, trying geocoding for: ${jobAddress}`);
          const geocoded = await geocodeAddress(jobAddress);
          if (geocoded) {
            jobLat = geocoded.lat;
            jobLon = geocoded.lon;
            console.log(`    Geocoded successfully: ${jobLat}, ${jobLon}`);
          } else {
            errors.push({
              type: 'no_coordinates',
              techName: techData.name,
              jobId: appointment.jobId,
              error: `Location has no coordinates and geocoding failed for: ${jobAddress}`,
            });
            continue;
          }
        }

        console.log(`  Processing: ${techData.name} - Job ${appointment.jobId} at ${format(scheduledTime, 'h:mm a')}${isFirstJob ? ' (FIRST JOB)' : ''}`);
        console.log(`    Address: ${jobAddress}`);

        // Only do GPS detection for first jobs (saves time and API calls)
        let arrival: { arrivalTime: Date; distanceFeet: number } | null = null;

        if (isFirstJob) {
          console.log(`    Coordinates: ${jobLat}, ${jobLon}`);

          // Step 3d: Get GPS history for this technician's truck
          // Window: 30 minutes before scheduled time to 2 hours after
          const gpsStartTime = subMinutes(scheduledTime, 30).toISOString();
          const gpsEndTime = addHours(scheduledTime, 2).toISOString();

          // Check if this is same-day data (segments are more reliable for today)
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const isSameDay = scheduledTime >= today;

          let gpsHistory: GPSHistoryPoint[] = [];
          let segments: VehicleSegment[] = [];
          let segmentArrival: { arrivalTime: Date; segment: VehicleSegment; distanceFeet: number } | null = null;

          // For same-day data, try segment-based arrival detection first (more accurate)
          if (isSameDay) {
            try {
              const todayStr = format(today, 'yyyy-MM-dd') + 'T00:00:00Z';
              const todayEndStr = format(today, 'yyyy-MM-dd') + 'T23:59:59Z';
              const segmentsData = await getVehicleSegments(techData.verizon_vehicle_id, todayStr, todayEndStr);
              segments = segmentsData.Segments || [];
              console.log(`    Vehicle segments: ${segments.length}`);

              // Try to find arrival from segment end times (truck stopped)
              segmentArrival = findArrivalFromSegments(
                segments,
                jobLat,
                jobLon,
                subMinutes(scheduledTime, 30),
                ARRIVAL_RADIUS_FEET
              );

              if (segmentArrival) {
                console.log(`    Truck stopped: ${formatInTimeZone(segmentArrival.arrivalTime, EST_TIMEZONE, 'h:mm:ss a')} EST (${Math.round(segmentArrival.distanceFeet)} ft from job)`);
              }
            } catch (segError: any) {
              console.log(`    Segments fetch failed, falling back to GPS: ${segError.message}`);
            }
          }

          // If no segment arrival found, fall back to GPS point-based detection
          if (!segmentArrival) {
            try {
              gpsHistory = await getVehicleGPSData(
                techData.verizon_vehicle_id,
                gpsStartTime,
                gpsEndTime
              );
              console.log(`    GPS points: ${gpsHistory.length}`);
            } catch (gpsError: any) {
              errors.push({
                type: 'gps_fetch',
                techName: techData.name,
                vehicleId: techData.verizon_vehicle_id,
                error: gpsError.message,
              });
              // For first job, GPS failure is critical - skip
              continue;
            }
          }

          // Step 3e: Determine arrival - prefer segment-based (truck stopped) over GPS proximity
          arrival = segmentArrival || findArrivalTime(
            gpsHistory,
            jobLat,
            jobLon,
            subMinutes(scheduledTime, 30),
            ARRIVAL_RADIUS_FEET
          );

          // Determine if arrival was from segment (truck stopped) or GPS proximity
          const arrivalType = segmentArrival ? 'segment' : 'gps';

          if (arrival) {
            const typeLabel = arrivalType === 'segment' ? 'Truck stopped' : 'GPS Arrival';
            console.log(`    ${typeLabel}: ${formatInTimeZone(arrival.arrivalTime, EST_TIMEZONE, 'h:mm:ss a')} EST (${Math.round(arrival.distanceFeet)} ft from job)`);
          } else {
            console.log(`    Arrival: NOT DETECTED within ${ARRIVAL_RADIUS_FEET} feet`);
          }
        }

        // Step 3f: Create/update job record
        const { data: jobData, error: jobError } = await supabase
          .from('jobs')
          .upsert({
            st_job_id: appointment.jobId,
            st_appointment_id: appointment.id,
            technician_id: techData.id,
            job_number: jobDetails.jobNumber || `${appointment.jobId}`,
            customer_name: location.name || null,
            job_date: dateStr,
            scheduled_start: appointment.start,
            actual_arrival: arrival?.arrivalTime.toISOString() || null,
            job_address: jobAddress,
            job_latitude: jobLat,
            job_longitude: jobLon,
            is_first_job_of_day: isFirstJob,
            status: appointment.status || 'Scheduled',
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'st_job_id',
          })
          .select()
          .single();

        if (jobError) {
          errors.push({ type: 'job_upsert', jobId: appointment.jobId, error: jobError.message });
          continue;
        }

        jobsProcessed++;

        // Step 3g: Calculate variance and create discrepancy if late (first jobs only)
        let varianceMinutes: number | null = null;
        let isLate = false;

        if (isFirstJob && arrival) {
          varianceMinutes = differenceInMinutes(arrival.arrivalTime, scheduledTime);
          isLate = varianceMinutes > 10; // More than 10 minutes late

          if (isLate) {
            const { error: discError } = await supabase
              .from('arrival_discrepancies')
              .upsert({
                technician_id: techData.id,
                job_id: jobData.id,
                job_date: dateStr,
                scheduled_arrival: appointment.start,
                actual_arrival: arrival.arrivalTime.toISOString(),
                variance_minutes: varianceMinutes,
                is_late: true,
                is_first_job: true,
                notes: `GPS arrival at ${formatInTimeZone(arrival.arrivalTime, EST_TIMEZONE, 'h:mm a')} - ${varianceMinutes}m late (${Math.round(arrival.distanceFeet)} ft from job)`,
              }, {
                onConflict: 'job_id',
              });

            if (!discError) {
              discrepanciesFound++;
              console.log(`    ❌ LATE: ${varianceMinutes} minutes`);
            }
          } else {
            console.log(`    ✅ ON TIME: ${Math.abs(varianceMinutes)}m ${varianceMinutes < 0 ? 'early' : 'after scheduled'}`);
          }
        } else if (isFirstJob) {
          // First job but no GPS arrival detected
          console.log(`    ⚠️ NO GPS ARRIVAL DETECTED - cannot verify arrival time`);
        }

        results.push({
          techName: techData.name,
          jobId: appointment.jobId,
          scheduledStart: appointment.start,
          actualArrival: arrival?.arrivalTime.toISOString() || null,
          varianceMinutes,
          isLate,
          jobAddress,
          distanceFromJob: arrival?.distanceFeet,
        });

        recordsProcessed++;
      } catch (procError: any) {
        errors.push({
          type: 'processing',
          jobId: appointment.jobId,
          error: procError.message,
        });
      }
    }

    // Step 4: Detect office visits for all technicians with trucks
    console.log('\nStep 4: Detecting office visits...');
    let officeVisitsDetected = 0;
    let midDayVisitsFound = 0;
    let unnecessaryVisitsFound = 0;

    // Clear existing office visits for this date before reprocessing
    // This ensures we don't have stale/duplicate data from previous runs
    await supabase
      .from('office_visits')
      .delete()
      .eq('visit_date', dateStr);

    for (const tech of techsWithTrucks || []) {
      // Skip if no vehicle ID (shouldn't happen due to query filter, but TypeScript needs this)
      if (!tech.verizon_vehicle_id) continue;

      // Skip technicians excluded from office visit tracking (managers, office staff, etc.)
      if (tech.exclude_from_office_visits) continue;

      try {
        // Get today's segments for this technician's vehicle
        // Use full day window to capture all segments including late arrivals
        const dayStartUtc = fromZonedTime(`${dateStr}T00:00:00`, EST_TIMEZONE).toISOString();
        const dayEndUtc = fromZonedTime(`${dateStr}T23:59:59`, EST_TIMEZONE).toISOString();
        const segmentsData = await getVehicleSegments(
          tech.verizon_vehicle_id,
          dayStartUtc,
          dayEndUtc
        );
        const segments = segmentsData.Segments || [];

        if (segments.length === 0) {
          continue;
        }

        // Detect office visits from segments
        // Pass the tech's first job scheduled time to help classify morning vs mid-day visits
        // Also pass tech config for unnecessary visit detection
        const firstJobTime = techFirstJobTime.get(tech.id);
        const techConfig: TechOfficeConfig = {
          takesTruckHome: tech.takes_truck_home === true,
          homeLocation: tech.home_latitude && tech.home_longitude
            ? { lat: tech.home_latitude, lon: tech.home_longitude }
            : null,
        };
        const officeVisits = detectOfficeVisits(segments, firstJobTime, techConfig);

        if (officeVisits.length === 0) {
          continue;
        }

        // Store each office visit
        for (const visit of officeVisits) {
          // Use arrival time for mid_day and end_of_day, departure for morning_departure
          const visitKey = visit.arrivalTime || visit.departureTime;

          const { error: visitError } = await supabase
            .from('office_visits')
            .upsert({
              technician_id: tech.id,
              visit_date: dateStr,
              arrival_time: visit.arrivalTime?.toISOString() || null,
              departure_time: visit.departureTime?.toISOString() || null,
              duration_minutes: visit.durationMinutes,
              visit_type: visit.visitType,
              is_unnecessary: visit.isUnnecessary || false,
            }, {
              onConflict: 'technician_id,visit_date,arrival_time',
            });

          if (!visitError) {
            officeVisitsDetected++;
            if (visit.isUnnecessary) {
              unnecessaryVisitsFound++;
            }
            if (visit.visitType === 'mid_day_visit') {
              midDayVisitsFound++;
              if (visit.isUnnecessary) {
                console.log(`  ${tech.name}: Mid-day visit (UNNECESSARY) - ${visit.durationMinutes || '?'} min - take-home truck went to office before first job`);
              } else {
                console.log(`  ${tech.name}: Mid-day visit - ${visit.durationMinutes || '?'} min`);
              }
            }
          }
        }
      } catch (visitError: any) {
        errors.push({
          type: 'office_visit_detection',
          techName: tech.name,
          error: visitError.message,
        });
      }
    }

    console.log(`Office visits detected: ${officeVisitsDetected} total, ${midDayVisitsFound} mid-day, ${unnecessaryVisitsFound} unnecessary`);

    // Update sync log
    if (syncLog) {
      await supabase
        .from('sync_logs')
        .update({
          status: errors.length > 0 ? 'completed_with_errors' : 'completed',
          records_processed: recordsProcessed,
          errors: errors.length > 0 ? errors : null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', syncLog.id);
    }

    console.log(`\nSync complete: ${jobsProcessed} jobs processed, ${discrepanciesFound} late arrivals detected, ${midDayVisitsFound} mid-day office visits (${unnecessaryVisitsFound} unnecessary), ${errors.length} errors`);

    return NextResponse.json({
      success: true,
      date: dateStr,
      summary: {
        techniciansWithTrucks: techsWithTrucks?.length || 0,
        appointmentsFound: appointments.length,
        jobsProcessed: jobsProcessed,
        lateArrivals: discrepanciesFound,
        onTimeArrivals: jobsProcessed - discrepanciesFound,
        officeVisitsDetected,
        midDayOfficeVisits: midDayVisitsFound,
        unnecessaryOfficeVisits: unnecessaryVisitsFound,
        errors: errors.length,
      },
      results,
      errors: errors.length > 0 ? errors : null,
    });
  } catch (error: any) {
    console.error('Sync error:', error);
    return NextResponse.json(
      { error: error.message || 'Sync failed' },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve sync status
export async function GET() {
  const supabase = createServerClient();

  try {
    const { data: syncLogs, error } = await supabase
      .from('sync_logs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(10);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      syncLogs,
    });
  } catch (error: any) {
    console.error('Error fetching sync logs:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch sync logs' },
      { status: 500 }
    );
  }
}
