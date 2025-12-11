import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getTechnicians, getAppointmentAssignments } from '@/lib/service-titan';
import { getVehicleLocation } from '@/lib/verizon-connect';
import { startOfDay, endOfDay, format, parseISO, differenceInMinutes } from 'date-fns';

export const maxDuration = 60; // Vercel/Netlify function timeout (up to 60s on pro)

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
    const { data: syncLog } = await supabase
      .from('sync_logs')
      .insert({
        sync_type: 'daily_arrival_check',
        status: 'running',
        records_processed: 0,
      })
      .select()
      .single();

    const errors: any[] = [];
    let recordsProcessed = 0;

    // Step 1: Quick sync of technicians (just upsert, no individual fetches)
    console.log('Step 1: Syncing technicians...');
    const techResult = await getTechnicians({ active: true, pageSize: 200 });
    const stTechnicians = techResult.data || [];

    // Batch upsert technicians
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

    // Step 2: Get appointment assignments
    console.log('Step 2: Getting appointment assignments...');
    const assignmentsResult = await getAppointmentAssignments({
      startsOnOrAfter,
      startsBefore,
      pageSize: 200,
    });
    const assignments = assignmentsResult.data || [];
    console.log(`Found ${assignments.length} assignments for ${dateStr}`);

    // Filter to only assignments for techs with trucks
    const relevantAssignments = assignments.filter((a: any) => techLookup.has(a.technicianId));
    console.log(`${relevantAssignments.length} assignments for techs with trucks`);

    // Group by technician
    const techAssignments: Record<number, any[]> = {};
    for (const assignment of relevantAssignments) {
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

    // Step 3: Process assignments and get GPS data
    console.log('Step 3: Processing assignments...');

    let jobsCreated = 0;
    let discrepanciesFound = 0;

    for (const [stTechIdStr, techAssigns] of Object.entries(techAssignments)) {
      const stTechId = parseInt(stTechIdStr);
      const techData = techLookup.get(stTechId);

      if (!techData) continue;

      // Get GPS location ONCE per technician (not per job)
      let gpsData = null;
      try {
        gpsData = await getVehicleLocation(techData.verizon_vehicle_id);
      } catch (gpsError: any) {
        errors.push({
          type: 'gps_fetch',
          vehicleId: techData.verizon_vehicle_id,
          techName: techData.name,
          error: gpsError.message,
        });
      }

      // Process first 5 jobs max per tech (to stay within timeout)
      const jobsToProcess = techAssigns.slice(0, 5);

      for (let i = 0; i < jobsToProcess.length; i++) {
        const assignment = jobsToProcess[i];
        const isFirstJob = i === 0;

        // Create job record (without fetching full job details to save time)
        const { data: jobData, error: jobError } = await supabase
          .from('jobs')
          .upsert({
            st_job_id: assignment.jobId,
            st_appointment_id: assignment.appointmentId,
            technician_id: techData.id,
            job_number: `${assignment.jobId}`,
            customer_name: null, // Skip fetching this
            job_date: dateStr,
            scheduled_start: assignment.assignedOn,
            is_first_job_of_day: isFirstJob,
            status: assignment.status || 'Scheduled',
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'st_job_id',
          })
          .select()
          .single();

        if (jobError) {
          errors.push({ type: 'job_upsert', jobId: assignment.jobId, error: jobError.message });
          continue;
        }

        jobsCreated++;

        // If we have GPS data, store it and check for late arrivals
        if (gpsData && isFirstJob) {
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
            event_type: 'sync_poll',
          });

          // Calculate if late based on current time vs scheduled
          const now = new Date();
          const scheduledTime = new Date(assignment.assignedOn);
          const varianceMinutes = differenceInMinutes(now, scheduledTime);

          // If it's past the scheduled time and they haven't completed
          if (varianceMinutes > 10 && assignment.status !== 'Done' && assignment.status !== 'Completed') {
            // Check if they're moving or stopped
            const isStopped = gpsData.DisplayState === 'Stop' || gpsData.Speed === 0;

            // Create discrepancy if late to first job
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
                notes: `GPS: ${gpsData.Address?.Locality || 'Unknown'}, ${isStopped ? 'Stopped' : 'Moving'}`,
              }, {
                onConflict: 'job_id',
              });

            if (!discError) {
              discrepanciesFound++;
              console.log(`Late: ${techData.name} is ${varianceMinutes}m past schedule (${isStopped ? 'stopped' : 'moving'})`);
            }
          }
        }

        recordsProcessed++;
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

    console.log(`Sync done: ${jobsCreated} jobs, ${discrepanciesFound} discrepancies, ${errors.length} errors`);

    return NextResponse.json({
      success: true,
      date: dateStr,
      techniciansWithTrucks: techsWithTrucks?.length || 0,
      assignmentsFound: assignments.length,
      relevantAssignments: relevantAssignments.length,
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
