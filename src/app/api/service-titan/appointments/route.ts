import { NextRequest, NextResponse } from 'next/server';
import { getAppointments, getJob } from '@/lib/service-titan';
import { createServerClient } from '@/lib/supabase';
import { startOfDay, endOfDay, format, parseISO } from 'date-fns';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date');
    const syncToDb = searchParams.get('sync') === 'true';

    // Default to today if no date provided
    const targetDate = dateParam ? parseISO(dateParam) : new Date();
    const startsOnOrAfter = startOfDay(targetDate).toISOString();
    const startsBefore = endOfDay(targetDate).toISOString();

    // Fetch appointments from Service Titan
    const result = await getAppointments({
      startsOnOrAfter,
      startsBefore,
      pageSize: 500,
    });

    const appointments = result.data || [];

    // Group appointments by technician to identify first job of day
    const technicianAppointments: Record<string, any[]> = {};

    for (const apt of appointments) {
      const techIds = apt.technicianIds || [];
      for (const techId of techIds) {
        if (!technicianAppointments[techId]) {
          technicianAppointments[techId] = [];
        }
        technicianAppointments[techId].push(apt);
      }
    }

    // Sort each technician's appointments by start time
    for (const techId of Object.keys(technicianAppointments)) {
      technicianAppointments[techId].sort((a, b) =>
        new Date(a.start).getTime() - new Date(b.start).getTime()
      );
    }

    // Mark first appointment of each day for each technician
    const appointmentsWithFirstJob = appointments.map((apt: any) => {
      const techIds = apt.technicianIds || [];
      const isFirstJob = techIds.some(
        (techId: number) =>
          technicianAppointments[techId]?.[0]?.id === apt.id
      );
      return { ...apt, isFirstJobOfDay: isFirstJob };
    });

    // Optionally sync to database
    if (syncToDb && appointmentsWithFirstJob.length > 0) {
      const supabase = createServerClient();
      const jobDate = format(targetDate, 'yyyy-MM-dd');

      for (const apt of appointmentsWithFirstJob) {
        const techIds = apt.technicianIds || [];

        for (const stTechId of techIds) {
          // Look up technician in our database
          const { data: techData } = await supabase
            .from('technicians')
            .select('id')
            .eq('st_technician_id', stTechId)
            .single();

          if (!techData) {
            console.warn(`Technician ${stTechId} not found in database`);
            continue;
          }

          // Fetch job details if available
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

          const { error } = await supabase
            .from('jobs')
            .upsert({
              st_job_id: apt.jobId || apt.id,
              st_appointment_id: apt.id,
              technician_id: techData.id,
              job_number: apt.jobNumber || jobDetails?.jobNumber || `APT-${apt.id}`,
              customer_name: apt.customerName || jobDetails?.customerName || null,
              job_date: jobDate,
              scheduled_start: apt.start,
              scheduled_end: apt.end || null,
              job_address: address.street
                ? `${address.street}, ${address.city}, ${address.state} ${address.zip}`
                : null,
              job_latitude: location.latitude || null,
              job_longitude: location.longitude || null,
              is_first_job_of_day: apt.isFirstJobOfDay,
              status: apt.status || 'scheduled',
              updated_at: new Date().toISOString(),
            }, {
              onConflict: 'st_job_id,st_appointment_id,technician_id',
            });

          if (error) {
            console.error(`Error upserting job for appointment ${apt.id}:`, error);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      date: format(targetDate, 'yyyy-MM-dd'),
      appointments: appointmentsWithFirstJob,
      count: appointments.length,
      synced: syncToDb,
    });
  } catch (error: any) {
    console.error('Service Titan Appointments API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch appointments' },
      { status: 500 }
    );
  }
}
