import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getVehicleSegments } from '@/lib/verizon-connect';
import { buildDayTimeline } from '@/lib/timeline-builder';
import { JobDetail } from '@/types/reports';
import { TechTimelineConfig, DayTimeline } from '@/types/timeline';
import { OFFICE_LOCATION } from '@/lib/geo-utils';
import { parseISO, differenceInMinutes } from 'date-fns';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const searchParams = req.nextUrl.searchParams;

  const date = searchParams.get('date');
  const technicianId = searchParams.get('technicianId');

  if (!date || !technicianId) {
    return NextResponse.json(
      { error: 'date and technicianId are required' },
      { status: 400 }
    );
  }

  try {
    // Get technician info including home location and vehicle ID
    const { data: technician, error: techError } = await supabase
      .from('technicians')
      .select(`
        id,
        name,
        takes_truck_home,
        home_latitude,
        home_longitude,
        home_address,
        exclude_from_office_visits,
        verizon_vehicle_id
      `)
      .eq('id', technicianId)
      .single();

    if (techError || !technician) {
      return NextResponse.json(
        { error: 'Technician not found' },
        { status: 404 }
      );
    }

    // Check if technician has GPS tracking
    if (!technician.verizon_vehicle_id) {
      return NextResponse.json(
        { error: 'No GPS vehicle assigned to this technician' },
        { status: 400 }
      );
    }

    // Get jobs for this technician on this date
    const { data: jobs, error: jobsError } = await supabase
      .from('jobs')
      .select(`
        id,
        job_number,
        customer_name,
        job_address,
        scheduled_start,
        actual_arrival,
        is_first_job_of_day,
        job_latitude,
        job_longitude,
        status
      `)
      .eq('technician_id', technicianId)
      .eq('job_date', date)
      .order('scheduled_start', { ascending: true });

    if (jobsError) throw jobsError;

    // Get discrepancies for late arrival info
    const { data: discrepancies, error: discError } = await supabase
      .from('arrival_discrepancies')
      .select('job_id, variance_minutes, is_late')
      .eq('technician_id', technicianId)
      .eq('job_date', date);

    if (discError) throw discError;

    // Create discrepancy map
    const discrepancyMap = new Map<string, { varianceMinutes: number; isLate: boolean }>();
    for (const disc of discrepancies || []) {
      if (disc.job_id) {
        discrepancyMap.set(disc.job_id, {
          varianceMinutes: disc.variance_minutes || 0,
          isLate: disc.is_late || false,
        });
      }
    }

    // Convert jobs to JobDetail format
    const jobDetails: JobDetail[] = (jobs || []).map(job => {
      const disc = discrepancyMap.get(job.id);

      let varianceMinutes: number | null = disc?.varianceMinutes ?? null;
      let isLate = disc?.isLate ?? false;

      if (varianceMinutes === null && job.scheduled_start && job.actual_arrival) {
        const scheduled = parseISO(job.scheduled_start);
        const actual = parseISO(job.actual_arrival);
        varianceMinutes = differenceInMinutes(actual, scheduled);
        isLate = varianceMinutes > 0;
      }

      return {
        id: job.id,
        jobNumber: job.job_number || '',
        customerName: job.customer_name,
        jobAddress: job.job_address,
        scheduledStart: job.scheduled_start,
        actualArrival: job.actual_arrival,
        varianceMinutes,
        isLate,
        isFirstJob: job.is_first_job_of_day || false,
        jobLatitude: job.job_latitude,
        jobLongitude: job.job_longitude,
        status: job.status,
      };
    });

    // Fetch GPS segments from Verizon for this date
    const startDateUtc = `${date}T00:00:00Z`;

    let segments: Awaited<ReturnType<typeof getVehicleSegments>>['Segments'] = [];
    try {
      const segmentsResponse = await getVehicleSegments(
        technician.verizon_vehicle_id,
        startDateUtc
      );
      segments = segmentsResponse?.Segments || [];
    } catch (gpsError: any) {
      console.error('Error fetching GPS segments:', gpsError);
      segments = [];
    }

    // Build tech config
    const techConfig: TechTimelineConfig = {
      takesTruckHome: technician.takes_truck_home || false,
      homeLocation: technician.home_latitude && technician.home_longitude
        ? {
            lat: technician.home_latitude,
            lon: technician.home_longitude,
            address: technician.home_address || 'Home',
          }
        : undefined,
      officeLocation: {
        lat: OFFICE_LOCATION.latitude,
        lon: OFFICE_LOCATION.longitude,
      },
      excludeFromOfficeVisits: technician.exclude_from_office_visits || false,
    };

    // Build the timeline
    const timeline: DayTimeline = buildDayTimeline({
      date,
      technicianId: technician.id,
      technicianName: technician.name,
      segments,
      jobs: jobDetails,
      techConfig,
    });

    return NextResponse.json({
      success: true,
      timeline,
    });
  } catch (error: any) {
    console.error('Error fetching technician timeline:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch technician timeline' },
      { status: 500 }
    );
  }
}
