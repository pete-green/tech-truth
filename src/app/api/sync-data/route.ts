import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getTechnicians, getAppointments, getAppointmentAssignmentsByJobId, getJob, getLocation } from '@/lib/service-titan';
import { getVehicleGPSHistory, GPSHistoryPoint } from '@/lib/verizon-connect';
import { startOfDay, endOfDay, format, parseISO, differenceInMinutes, subMinutes, addHours } from 'date-fns';
import { findArrivalTime, ARRIVAL_RADIUS_FEET } from '@/lib/geo-utils';

export const maxDuration = 60; // Vercel/Netlify function timeout (up to 60s on pro)

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
    const firstJobOnly = body.firstJobOnly !== false; // Default to true

    // Default to today if no date provided
    const targetDate = dateParam ? parseISO(dateParam) : new Date();
    const dateStr = format(targetDate, 'yyyy-MM-dd');
    const startsOnOrAfter = startOfDay(targetDate).toISOString();
    const startsBefore = endOfDay(targetDate).toISOString();

    console.log(`Starting sync for date: ${dateStr}`);

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
      .select('id, st_technician_id, name, verizon_vehicle_id')
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
    let jobsProcessed = 0;
    let discrepanciesFound = 0;

    // Sort appointments by start time
    const sortedAppointments = [...appointments].sort((a: any, b: any) =>
      new Date(a.start).getTime() - new Date(b.start).getTime()
    );

    for (const appointment of sortedAppointments) {
      try {
        // Step 3a: Get the technician assignment for this job
        const assignmentResult = await getAppointmentAssignmentsByJobId(appointment.jobId);
        const assignments = assignmentResult.data || [];

        if (assignments.length === 0) {
          // No technician assigned to this job
          continue;
        }

        // Get the active assignment (there might be multiple if tech was reassigned)
        const assignment = assignments.find((a: any) => a.active) || assignments[0];
        const stTechId = assignment.technicianId;

        // Check if this tech has a truck assigned in our system
        const techData = techLookup.get(stTechId);
        if (!techData) {
          // Tech doesn't have a truck assigned, skip
          continue;
        }

        // If we only want first jobs and we've already processed this tech's first job, skip
        if (firstJobOnly && processedTechFirstJob.has(stTechId)) {
          continue;
        }

        // Mark this tech's first job as being processed
        processedTechFirstJob.add(stTechId);

        const scheduledTime = new Date(appointment.start);

        // Step 3b: Get job details for location
        const jobDetails = await getJob(appointment.jobId);

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

        if (!location.address?.latitude || !location.address?.longitude) {
          errors.push({
            type: 'no_coordinates',
            techName: techData.name,
            jobId: appointment.jobId,
            error: 'Location has no coordinates',
          });
          continue;
        }

        const jobLat = location.address.latitude;
        const jobLon = location.address.longitude;
        const jobAddress = `${location.address.street}, ${location.address.city}, ${location.address.state} ${location.address.zip}`;

        console.log(`  Processing: ${techData.name} - Job ${appointment.jobId} at ${format(scheduledTime, 'h:mm a')}`);
        console.log(`    Address: ${jobAddress}`);
        console.log(`    Coordinates: ${jobLat}, ${jobLon}`);

        // Step 3d: Get GPS history for this technician's truck
        // Window: 30 minutes before scheduled time to 2 hours after
        const gpsStartTime = subMinutes(scheduledTime, 30).toISOString();
        const gpsEndTime = addHours(scheduledTime, 2).toISOString();

        let gpsHistory: GPSHistoryPoint[] = [];
        try {
          gpsHistory = await getVehicleGPSHistory(
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
          continue;
        }

        // Step 3e: Find first arrival at job location using GPS
        const arrival = findArrivalTime(
          gpsHistory,
          jobLat,
          jobLon,
          subMinutes(scheduledTime, 30), // Look from 30 min before scheduled
          ARRIVAL_RADIUS_FEET
        );

        if (arrival) {
          console.log(`    GPS Arrival: ${format(arrival.arrivalTime, 'h:mm:ss a')} (${Math.round(arrival.distanceFeet)} ft from job)`);
        } else {
          console.log(`    GPS Arrival: NOT DETECTED within ${ARRIVAL_RADIUS_FEET} feet`);
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
            is_first_job_of_day: true,
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

        // Step 3g: Store GPS events for this job (sample, not all)
        if (gpsHistory.length > 0) {
          const gpsInserts = gpsHistory.slice(0, 50).map((point) => ({
            technician_id: techData.id,
            job_id: jobData.id,
            latitude: point.Latitude,
            longitude: point.Longitude,
            timestamp: point.UpdateUtc,
            speed: point.Speed,
            heading: null,
            address: point.Address?.AddressLine1 || null,
            event_type: 'history_sync',
          }));

          await supabase.from('gps_events').insert(gpsInserts);
        }

        // Step 3h: Calculate variance and create discrepancy if late
        let varianceMinutes: number | null = null;
        let isLate = false;

        if (arrival) {
          varianceMinutes = differenceInMinutes(arrival.arrivalTime, scheduledTime);
          isLate = varianceMinutes > 10; // More than 10 minutes late
        } else if (new Date() > scheduledTime) {
          // No arrival found and we're past scheduled time
          varianceMinutes = differenceInMinutes(new Date(), scheduledTime);
          isLate = true;
        }

        // Create discrepancy record if late
        if (isLate && varianceMinutes !== null && varianceMinutes > 0) {
          // actual_arrival is required by schema, use current time if no GPS arrival detected
          const actualArrivalTime = arrival?.arrivalTime.toISOString() || new Date().toISOString();

          const { error: discError } = await supabase
            .from('arrival_discrepancies')
            .upsert({
              technician_id: techData.id,
              job_id: jobData.id,
              job_date: dateStr,
              scheduled_arrival: appointment.start,
              actual_arrival: actualArrivalTime,
              variance_minutes: varianceMinutes,
              is_late: true,
              is_first_job: true,
              notes: arrival
                ? `GPS arrival at ${format(arrival.arrivalTime, 'h:mm a')} - ${varianceMinutes}m late (${Math.round(arrival.distanceFeet)} ft from job)`
                : `No GPS arrival detected within ${ARRIVAL_RADIUS_FEET} feet - ${gpsHistory.length} GPS points checked`,
            }, {
              onConflict: 'job_id',
            });

          if (!discError) {
            discrepanciesFound++;
            console.log(`    ❌ LATE: ${varianceMinutes} minutes`);
          }
        } else if (arrival && varianceMinutes !== null) {
          console.log(`    ✅ ON TIME: ${Math.abs(varianceMinutes)}m ${varianceMinutes < 0 ? 'early' : 'after scheduled'}`);
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

    console.log(`\nSync complete: ${jobsProcessed} jobs processed, ${discrepanciesFound} late arrivals detected, ${errors.length} errors`);

    return NextResponse.json({
      success: true,
      date: dateStr,
      summary: {
        techniciansWithTrucks: techsWithTrucks?.length || 0,
        appointmentsFound: appointments.length,
        firstJobsProcessed: jobsProcessed,
        lateArrivals: discrepanciesFound,
        onTimeArrivals: jobsProcessed - discrepanciesFound,
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
