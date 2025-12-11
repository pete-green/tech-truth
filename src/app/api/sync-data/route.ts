import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getTechnicians, getAppointmentAssignments, getJob, getLocation } from '@/lib/service-titan';
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

    // Get technicians WITH trucks assigned
    const { data: techsWithTrucks } = await supabase
      .from('technicians')
      .select('id, st_technician_id, name, verizon_vehicle_id')
      .not('verizon_vehicle_id', 'is', null);

    const techLookup = new Map();
    for (const t of techsWithTrucks || []) {
      techLookup.set(t.st_technician_id, t);
    }

    console.log(`Found ${techsWithTrucks?.length || 0} technicians with trucks assigned`);

    // Step 2: Get appointment assignments
    console.log('Step 2: Getting appointment assignments...');
    const assignmentsResult = await getAppointmentAssignments({
      startsOnOrAfter,
      startsBefore,
      pageSize: 200,
    });
    const assignments = assignmentsResult.data || [];
    console.log(`Found ${assignments.length} assignments for ${dateStr}`);

    // Filter to techs with trucks and group by technician
    const techAssignments: Record<number, any[]> = {};
    for (const assignment of assignments) {
      if (!techLookup.has(assignment.technicianId)) continue;

      const techId = assignment.technicianId;
      if (!techAssignments[techId]) {
        techAssignments[techId] = [];
      }
      techAssignments[techId].push(assignment);
    }

    // Sort each tech's assignments by time
    for (const techId of Object.keys(techAssignments)) {
      techAssignments[parseInt(techId)].sort((a: any, b: any) =>
        new Date(a.assignedOn).getTime() - new Date(b.assignedOn).getTime()
      );
    }

    // Step 3: Process each technician's first job
    console.log('Step 3: Processing first jobs with GPS history...');

    let jobsProcessed = 0;
    let discrepanciesFound = 0;

    for (const [stTechIdStr, techAssigns] of Object.entries(techAssignments)) {
      const stTechId = parseInt(stTechIdStr);
      const techData = techLookup.get(stTechId);

      if (!techData || techAssigns.length === 0) continue;

      // Get first job assignment
      const firstAssignment = techAssigns[0];
      const scheduledTime = new Date(firstAssignment.assignedOn);

      try {
        // Step 3a: Get job details from Service Titan
        const jobDetails = await getJob(firstAssignment.jobId);

        if (!jobDetails.locationId) {
          errors.push({
            type: 'no_location',
            techName: techData.name,
            jobId: firstAssignment.jobId,
            error: 'Job has no locationId',
          });
          continue;
        }

        // Step 3b: Get location with coordinates
        const location = await getLocation(jobDetails.locationId);

        if (!location.address?.latitude || !location.address?.longitude) {
          errors.push({
            type: 'no_coordinates',
            techName: techData.name,
            jobId: firstAssignment.jobId,
            error: 'Location has no coordinates',
          });
          continue;
        }

        const jobLat = location.address.latitude;
        const jobLon = location.address.longitude;
        const jobAddress = `${location.address.street}, ${location.address.city}, ${location.address.state} ${location.address.zip}`;

        // Step 3c: Get GPS history for this technician
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
        } catch (gpsError: any) {
          errors.push({
            type: 'gps_fetch',
            techName: techData.name,
            vehicleId: techData.verizon_vehicle_id,
            error: gpsError.message,
          });
          continue;
        }

        console.log(`  ${techData.name}: Got ${gpsHistory.length} GPS points`);

        // Step 3d: Find first arrival at job location
        const arrival = findArrivalTime(
          gpsHistory,
          jobLat,
          jobLon,
          subMinutes(scheduledTime, 30), // Look from 30 min before scheduled
          ARRIVAL_RADIUS_FEET
        );

        // Step 3e: Create/update job record
        const { data: jobData, error: jobError } = await supabase
          .from('jobs')
          .upsert({
            st_job_id: firstAssignment.jobId,
            st_appointment_id: firstAssignment.appointmentId,
            technician_id: techData.id,
            job_number: jobDetails.jobNumber || `${firstAssignment.jobId}`,
            customer_name: location.name || null,
            job_date: dateStr,
            scheduled_start: firstAssignment.assignedOn,
            actual_arrival: arrival?.arrivalTime.toISOString() || null,
            job_address: jobAddress,
            job_latitude: jobLat,
            job_longitude: jobLon,
            is_first_job_of_day: true,
            status: firstAssignment.status || 'Scheduled',
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'st_job_id',
          })
          .select()
          .single();

        if (jobError) {
          errors.push({ type: 'job_upsert', jobId: firstAssignment.jobId, error: jobError.message });
          continue;
        }

        jobsProcessed++;

        // Step 3f: Store GPS events for this job
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

        // Step 3g: Calculate variance and create discrepancy if late
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

        // Create discrepancy record
        if (isLate && varianceMinutes !== null && varianceMinutes > 0) {
          const { error: discError } = await supabase
            .from('arrival_discrepancies')
            .upsert({
              technician_id: techData.id,
              job_id: jobData.id,
              job_date: dateStr,
              scheduled_arrival: firstAssignment.assignedOn,
              actual_arrival: arrival?.arrivalTime.toISOString() || new Date().toISOString(),
              variance_minutes: varianceMinutes,
              is_late: true,
              is_first_job: true,
              notes: arrival
                ? `Arrived at ${format(arrival.arrivalTime, 'h:mm a')} - ${varianceMinutes}m late`
                : `No arrival detected - GPS shows ${gpsHistory.length} points`,
            }, {
              onConflict: 'job_id',
            });

          if (!discError) {
            discrepanciesFound++;
            console.log(`  LATE: ${techData.name} - ${varianceMinutes}m late to ${jobAddress.split(',')[0]}`);
          }
        } else if (arrival && varianceMinutes !== null) {
          // On time or early - still record for tracking
          console.log(`  ON TIME: ${techData.name} arrived ${Math.abs(varianceMinutes)}m ${varianceMinutes < 0 ? 'early' : 'late'}`);
        }

        results.push({
          techName: techData.name,
          jobId: firstAssignment.jobId,
          scheduledStart: firstAssignment.assignedOn,
          actualArrival: arrival?.arrivalTime.toISOString() || null,
          varianceMinutes,
          isLate,
          jobAddress,
        });

        recordsProcessed++;
      } catch (procError: any) {
        errors.push({
          type: 'processing',
          techName: techData.name,
          jobId: firstAssignment.jobId,
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

    console.log(`Sync done: ${jobsProcessed} jobs, ${discrepanciesFound} late arrivals, ${errors.length} errors`);

    return NextResponse.json({
      success: true,
      date: dateStr,
      summary: {
        techniciansWithTrucks: techsWithTrucks?.length || 0,
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
