import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getTechnicians, getAppointmentAssignments, getJob } from '@/lib/service-titan';
import { getVehicleLocation } from '@/lib/verizon-connect';
import { startOfDay, endOfDay, format, parseISO, differenceInMinutes } from 'date-fns';

// Calculate distance between two points in meters using Haversine formula
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth's radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient();

  try {
    const body = await req.json();
    const dateParam = body.date;

    // Default to today if no date provided
    const targetDate = dateParam ? parseISO(dateParam) : new Date();
    const dateStr = format(targetDate, 'yyyy-MM-dd');
    const startsOnOrAfter = startOfDay(targetDate).toISOString();
    const startsBefore = endOfDay(targetDate).toISOString();

    console.log(`Starting sync for date: ${dateStr}`);

    // Create sync log entry
    const { data: syncLog, error: syncLogError } = await supabase
      .from('sync_logs')
      .insert({
        sync_type: 'daily_arrival_check',
        status: 'running',
        records_processed: 0,
      })
      .select()
      .single();

    if (syncLogError) {
      console.error('Error creating sync log:', syncLogError);
    }

    const errors: any[] = [];
    let recordsProcessed = 0;
    let jobsCreated = 0;
    let discrepanciesFound = 0;

    // Step 1: Sync technicians from Service Titan
    console.log('Step 1: Syncing technicians...');
    const techResult = await getTechnicians({ active: true, pageSize: 500 });
    const stTechnicians = techResult.data || [];
    console.log(`Found ${stTechnicians.length} technicians in Service Titan`);

    for (const tech of stTechnicians) {
      const { error } = await supabase
        .from('technicians')
        .upsert({
          st_technician_id: tech.id,
          name: tech.name || `${tech.firstName || ''} ${tech.lastName || ''}`.trim(),
          email: tech.email || null,
          phone: tech.phone || tech.phoneNumber || null,
          active: tech.active !== false,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'st_technician_id',
        });

      if (error) {
        errors.push({ type: 'technician_sync', techId: tech.id, error: error.message });
      }
    }

    // Step 2: Get appointment assignments (technician -> appointment mapping)
    console.log('Step 2: Getting appointment assignments...');
    const assignmentsResult = await getAppointmentAssignments({
      startsOnOrAfter,
      startsBefore,
      pageSize: 500,
    });
    const assignments = assignmentsResult.data || [];
    console.log(`Found ${assignments.length} appointment assignments for ${dateStr}`);

    // Group assignments by technician to identify first job
    const techAssignments: Record<number, any[]> = {};
    for (const assignment of assignments) {
      const techId = assignment.technicianId;
      if (!techAssignments[techId]) {
        techAssignments[techId] = [];
      }
      techAssignments[techId].push(assignment);
    }

    // Step 3: Process each technician's assignments
    console.log('Step 3: Processing assignments and checking GPS...');

    for (const [stTechIdStr, techAssigns] of Object.entries(techAssignments)) {
      const stTechId = parseInt(stTechIdStr);

      // Get technician from our database (to get verizon_vehicle_id)
      const { data: techData } = await supabase
        .from('technicians')
        .select('id, name, verizon_vehicle_id')
        .eq('st_technician_id', stTechId)
        .single();

      if (!techData) {
        console.log(`Tech ${stTechId} not found in database, skipping`);
        continue;
      }

      if (!techData.verizon_vehicle_id) {
        console.log(`Tech ${techData.name} has no truck assigned, skipping GPS check`);
        continue;
      }

      // Sort assignments by scheduled time to determine first job
      techAssigns.sort((a: any, b: any) => {
        // Use assignedOn as proxy for schedule order if no explicit start time
        return new Date(a.assignedOn).getTime() - new Date(b.assignedOn).getTime();
      });

      // Process each assignment
      for (let i = 0; i < techAssigns.length; i++) {
        const assignment = techAssigns[i];
        const isFirstJob = i === 0;

        // Get job details to find the address/location
        let jobDetails = null;
        let jobLocation = null;

        if (assignment.jobId) {
          try {
            jobDetails = await getJob(assignment.jobId);

            // Try to get location from job
            if (jobDetails?.location) {
              jobLocation = {
                address: jobDetails.location.address,
                latitude: jobDetails.location.latitude,
                longitude: jobDetails.location.longitude,
              };
            }
          } catch (err: any) {
            console.warn(`Could not fetch job ${assignment.jobId}:`, err.message);
          }
        }

        // Build address string
        const addressParts = [];
        if (jobLocation?.address) {
          const addr = jobLocation.address;
          if (addr.street) addressParts.push(addr.street);
          if (addr.city) addressParts.push(addr.city);
          if (addr.state) addressParts.push(addr.state);
          if (addr.zip) addressParts.push(addr.zip);
        }
        const jobAddress = addressParts.length > 0 ? addressParts.join(', ') : null;

        // Create/update job record
        const { data: jobData, error: jobError } = await supabase
          .from('jobs')
          .upsert({
            st_job_id: assignment.jobId,
            st_appointment_id: assignment.appointmentId,
            technician_id: techData.id,
            job_number: jobDetails?.jobNumber || `JOB-${assignment.jobId}`,
            customer_name: jobDetails?.customer?.name || null,
            job_date: dateStr,
            scheduled_start: assignment.assignedOn, // Using assignedOn as scheduled time
            scheduled_end: null,
            job_address: jobAddress,
            job_latitude: jobLocation?.latitude || null,
            job_longitude: jobLocation?.longitude || null,
            is_first_job_of_day: isFirstJob,
            status: assignment.status || 'scheduled',
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'st_job_id',
          })
          .select()
          .single();

        if (jobError) {
          errors.push({
            type: 'job_upsert',
            jobId: assignment.jobId,
            error: jobError.message,
          });
          continue;
        }

        jobsCreated++;

        // Get current GPS location for this technician's truck
        try {
          const gpsData = await getVehicleLocation(techData.verizon_vehicle_id);

          if (gpsData) {
            // Store GPS event
            await supabase.from('gps_events').insert({
              technician_id: techData.id,
              job_id: jobData.id,
              latitude: gpsData.Latitude,
              longitude: gpsData.Longitude,
              timestamp: gpsData.UpdateUTC,
              speed: gpsData.Speed || null,
              heading: gpsData.Direction || null,
              address: gpsData.Address?.AddressLine1 || null,
              event_type: 'location_poll',
            });

            // If we have job location, check if technician is at the job site
            if (jobLocation?.latitude && jobLocation?.longitude) {
              const distanceToJob = calculateDistance(
                gpsData.Latitude,
                gpsData.Longitude,
                jobLocation.latitude,
                jobLocation.longitude
              );

              // If within 150 meters, consider them "at" the job
              if (distanceToJob <= 150) {
                const gpsTime = new Date(gpsData.UpdateUTC);
                const scheduledTime = new Date(assignment.assignedOn);
                const varianceMinutes = differenceInMinutes(gpsTime, scheduledTime);

                // Update job with actual arrival
                await supabase
                  .from('jobs')
                  .update({
                    actual_arrival: gpsData.UpdateUTC,
                    arrival_variance_minutes: varianceMinutes,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', jobData.id);

                // If late (positive variance), create discrepancy
                if (varianceMinutes > 5) { // Allow 5 min grace period
                  const { error: discError } = await supabase
                    .from('arrival_discrepancies')
                    .upsert({
                      technician_id: techData.id,
                      job_id: jobData.id,
                      job_date: dateStr,
                      scheduled_arrival: assignment.assignedOn,
                      actual_arrival: gpsData.UpdateUTC,
                      variance_minutes: varianceMinutes,
                      is_late: true,
                      is_first_job: isFirstJob,
                    }, {
                      onConflict: 'job_id',
                    });

                  if (!discError) {
                    discrepanciesFound++;
                    console.log(`Discrepancy found: ${techData.name} was ${varianceMinutes}m late to job ${assignment.jobId}`);
                  }
                }
              }
            }
          }

          recordsProcessed++;
        } catch (gpsError: any) {
          errors.push({
            type: 'gps_fetch',
            vehicleId: techData.verizon_vehicle_id,
            techName: techData.name,
            error: gpsError.message,
          });
        }
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

    console.log(`Sync completed: ${jobsCreated} jobs, ${discrepanciesFound} discrepancies, ${errors.length} errors`);

    return NextResponse.json({
      success: true,
      date: dateStr,
      techniciansProcessed: stTechnicians.length,
      assignmentsProcessed: assignments.length,
      jobsCreated,
      discrepanciesFound,
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
