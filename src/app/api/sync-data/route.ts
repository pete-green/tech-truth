import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getTechnicians, getAppointments, getJob } from '@/lib/service-titan';
import { getAllVehicleLocations, getVehicleLocationHistory } from '@/lib/verizon-connect';
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

// Find when technician arrived at job location (within ~100 meters)
function findArrivalTime(
  gpsHistory: any[],
  jobLat: number,
  jobLon: number,
  arrivalThresholdMeters: number = 100
): string | null {
  for (const point of gpsHistory) {
    const lat = point.Latitude || point.latitude;
    const lon = point.Longitude || point.longitude;
    const timestamp = point.Timestamp || point.timestamp || point.RecordedAt;

    if (lat && lon) {
      const distance = calculateDistance(lat, lon, jobLat, jobLon);
      if (distance <= arrivalThresholdMeters) {
        return timestamp;
      }
    }
  }
  return null;
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

    // Step 1: Sync technicians from Service Titan
    console.log('Syncing technicians...');
    const techResult = await getTechnicians({ active: true, pageSize: 500 });
    const stTechnicians = techResult.data || [];

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

    // Step 2: Sync appointments from Service Titan
    console.log('Syncing appointments...');
    const aptResult = await getAppointments({
      startsOnOrAfter,
      startsBefore,
      pageSize: 500,
    });
    const appointments = aptResult.data || [];

    // Group by technician to identify first job
    const techAppointments: Record<string, any[]> = {};
    for (const apt of appointments) {
      const techIds = apt.technicianIds || [];
      for (const techId of techIds) {
        if (!techAppointments[techId]) {
          techAppointments[techId] = [];
        }
        techAppointments[techId].push(apt);
      }
    }

    // Sort by start time
    for (const techId of Object.keys(techAppointments)) {
      techAppointments[techId].sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
      );
    }

    // Step 3: For each technician with appointments, check arrival times
    console.log('Processing appointments and checking arrivals...');

    for (const [stTechIdStr, apts] of Object.entries(techAppointments)) {
      const stTechId = parseInt(stTechIdStr);

      // Get technician from our database
      const { data: techData } = await supabase
        .from('technicians')
        .select('id, verizon_vehicle_id')
        .eq('st_technician_id', stTechId)
        .single();

      if (!techData) {
        errors.push({
          type: 'tech_not_found',
          stTechId,
          error: 'Technician not in database',
        });
        continue;
      }

      // Process each appointment
      for (let i = 0; i < apts.length; i++) {
        const apt = apts[i];
        const isFirstJob = i === 0;

        // Get job details
        let jobDetails = null;
        if (apt.jobId) {
          try {
            jobDetails = await getJob(apt.jobId);
          } catch (err) {
            console.warn(`Could not fetch job ${apt.jobId}:`, err);
          }
        }

        const location = jobDetails?.location || {};
        const address = location.address || {};
        const jobLat = location.latitude || address.latitude;
        const jobLon = location.longitude || address.longitude;

        // Upsert job
        const { data: jobData, error: jobError } = await supabase
          .from('jobs')
          .upsert({
            st_job_id: apt.jobId || apt.id,
            st_appointment_id: apt.id,
            technician_id: techData.id,
            job_number: apt.jobNumber || jobDetails?.jobNumber || `APT-${apt.id}`,
            customer_name: apt.customerName || jobDetails?.customerName || null,
            job_date: dateStr,
            scheduled_start: apt.start,
            scheduled_end: apt.end || null,
            job_address: address.street
              ? `${address.street}, ${address.city}, ${address.state} ${address.zip}`
              : null,
            job_latitude: jobLat || null,
            job_longitude: jobLon || null,
            is_first_job_of_day: isFirstJob,
            status: apt.status || 'scheduled',
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'st_job_id,st_appointment_id,technician_id',
          })
          .select()
          .single();

        if (jobError) {
          errors.push({
            type: 'job_upsert',
            aptId: apt.id,
            error: jobError.message,
          });
          continue;
        }

        // If we have GPS data and job location, determine actual arrival
        if (techData.verizon_vehicle_id && jobLat && jobLon) {
          try {
            // Get GPS history around the scheduled time (2 hours before to 2 hours after)
            const scheduledTime = new Date(apt.start);
            const gpsStart = new Date(scheduledTime.getTime() - 2 * 60 * 60 * 1000).toISOString();
            const gpsEnd = new Date(scheduledTime.getTime() + 2 * 60 * 60 * 1000).toISOString();

            const gpsHistory = await getVehicleLocationHistory(
              techData.verizon_vehicle_id,
              gpsStart,
              gpsEnd
            );

            const gpsPoints = Array.isArray(gpsHistory) ? gpsHistory : gpsHistory?.data || [];

            // Sort GPS points by timestamp
            gpsPoints.sort((a: any, b: any) => {
              const timeA = new Date(a.Timestamp || a.timestamp || a.RecordedAt).getTime();
              const timeB = new Date(b.Timestamp || b.timestamp || b.RecordedAt).getTime();
              return timeA - timeB;
            });

            // Find when they arrived at the job location
            const actualArrivalTime = findArrivalTime(gpsPoints, jobLat, jobLon);

            if (actualArrivalTime) {
              const varianceMinutes = differenceInMinutes(
                new Date(actualArrivalTime),
                new Date(apt.start)
              );

              // Update job with actual arrival
              await supabase
                .from('jobs')
                .update({
                  actual_arrival: actualArrivalTime,
                  arrival_variance_minutes: varianceMinutes,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', jobData.id);

              // If late (positive variance means arrived after scheduled time)
              if (varianceMinutes > 0) {
                // Create or update discrepancy record
                await supabase
                  .from('arrival_discrepancies')
                  .upsert({
                    technician_id: techData.id,
                    job_id: jobData.id,
                    job_date: dateStr,
                    scheduled_arrival: apt.start,
                    actual_arrival: actualArrivalTime,
                    variance_minutes: varianceMinutes,
                    is_late: true,
                    is_first_job: isFirstJob,
                  }, {
                    onConflict: 'job_id',
                    ignoreDuplicates: false,
                  });

                recordsProcessed++;
              }
            }
          } catch (gpsError: any) {
            errors.push({
              type: 'gps_fetch',
              vehicleId: techData.verizon_vehicle_id,
              error: gpsError.message,
            });
          }
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

    return NextResponse.json({
      success: true,
      date: dateStr,
      techniciansProcessed: stTechnicians.length,
      appointmentsProcessed: appointments.length,
      discrepanciesFound: recordsProcessed,
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
export async function GET(req: NextRequest) {
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
