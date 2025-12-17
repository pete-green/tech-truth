import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { calculateDistanceFeet } from '@/lib/geo-utils';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const searchParams = req.nextUrl.searchParams;

  const technicianId = searchParams.get('technicianId');
  const date = searchParams.get('date');
  const latitude = searchParams.get('latitude');
  const longitude = searchParams.get('longitude');

  if (!technicianId || !date) {
    return NextResponse.json(
      { error: 'technicianId and date are required' },
      { status: 400 }
    );
  }

  try {
    // Fetch all jobs for this technician on this date
    const { data: jobs, error: jobsError } = await supabase
      .from('jobs')
      .select(`
        id,
        job_number,
        customer_name,
        job_address,
        scheduled_start,
        scheduled_end,
        job_latitude,
        job_longitude,
        actual_arrival,
        status
      `)
      .eq('technician_id', technicianId)
      .eq('job_date', date)
      .order('scheduled_start', { ascending: true });

    if (jobsError) throw jobsError;

    // Check which jobs already have manual associations
    const { data: associations } = await supabase
      .from('manual_job_associations')
      .select('job_id')
      .eq('technician_id', technicianId)
      .eq('job_date', date);

    const associatedJobIds = new Set(associations?.map(a => a.job_id) || []);

    // Calculate distance from the unknown stop if coordinates provided
    const stopLat = latitude ? parseFloat(latitude) : null;
    const stopLon = longitude ? parseFloat(longitude) : null;

    const jobsWithDistance = (jobs || []).map(job => {
      let distanceFeet: number | null = null;

      if (stopLat && stopLon && job.job_latitude && job.job_longitude) {
        distanceFeet = Math.round(calculateDistanceFeet(
          stopLat,
          stopLon,
          job.job_latitude,
          job.job_longitude
        ));
      }

      return {
        id: job.id,
        jobNumber: job.job_number,
        customerName: job.customer_name,
        jobAddress: job.job_address,
        scheduledStart: job.scheduled_start,
        scheduledEnd: job.scheduled_end,
        jobLatitude: job.job_latitude,
        jobLongitude: job.job_longitude,
        actualArrival: job.actual_arrival,
        status: job.status,
        distanceFeet,
        hasManualAssociation: associatedJobIds.has(job.id),
      };
    });

    // Sort by distance if available (closest first), otherwise by scheduled time
    if (stopLat && stopLon) {
      jobsWithDistance.sort((a, b) => {
        if (a.distanceFeet === null && b.distanceFeet === null) return 0;
        if (a.distanceFeet === null) return 1;
        if (b.distanceFeet === null) return -1;
        return a.distanceFeet - b.distanceFeet;
      });
    }

    return NextResponse.json({
      success: true,
      jobs: jobsWithDistance,
    });
  } catch (error: any) {
    console.error('Error fetching jobs for technician:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch jobs' },
      { status: 500 }
    );
  }
}
