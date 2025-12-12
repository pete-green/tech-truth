import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { parseISO, subMinutes, addMinutes } from 'date-fns';
import { calculateDistanceFeet } from '@/lib/geo-utils';

export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const searchParams = req.nextUrl.searchParams;

  const technicianId = searchParams.get('technicianId');
  const jobId = searchParams.get('jobId');
  const scheduledTime = searchParams.get('scheduledTime');

  if (!technicianId || !jobId || !scheduledTime) {
    return NextResponse.json(
      { error: 'technicianId, jobId, and scheduledTime are required' },
      { status: 400 }
    );
  }

  try {
    // Get job info including location
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id, job_latitude, job_longitude, job_address')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    if (!job.job_latitude || !job.job_longitude) {
      return NextResponse.json({
        success: true,
        jobLocation: null,
        truckLocation: null,
        error: 'Job location coordinates not available',
      });
    }

    // Parse scheduled time and create a window around it
    const scheduledDate = parseISO(scheduledTime);
    const windowStart = subMinutes(scheduledDate, 5);
    const windowEnd = addMinutes(scheduledDate, 5);

    // Query GPS events around the scheduled time
    const { data: gpsEvents, error: gpsError } = await supabase
      .from('gps_events')
      .select('latitude, longitude, timestamp, address')
      .eq('technician_id', technicianId)
      .gte('timestamp', windowStart.toISOString())
      .lte('timestamp', windowEnd.toISOString())
      .order('timestamp', { ascending: true });

    if (gpsError) throw gpsError;

    let truckLocation = null;

    if (gpsEvents && gpsEvents.length > 0) {
      // Find the GPS point closest to the scheduled time
      let closestEvent = gpsEvents[0];
      let closestDiff = Math.abs(parseISO(closestEvent.timestamp).getTime() - scheduledDate.getTime());

      for (const event of gpsEvents) {
        const diff = Math.abs(parseISO(event.timestamp).getTime() - scheduledDate.getTime());
        if (diff < closestDiff) {
          closestDiff = diff;
          closestEvent = event;
        }
      }

      const distance = calculateDistanceFeet(
        closestEvent.latitude,
        closestEvent.longitude,
        job.job_latitude,
        job.job_longitude
      );

      truckLocation = {
        latitude: closestEvent.latitude,
        longitude: closestEvent.longitude,
        address: closestEvent.address,
        timestamp: closestEvent.timestamp,
        distanceFromJobFeet: Math.round(distance),
      };
    }

    return NextResponse.json({
      success: true,
      jobLocation: {
        latitude: job.job_latitude,
        longitude: job.job_longitude,
        address: job.job_address,
      },
      truckLocation,
    });
  } catch (error: any) {
    console.error('Error fetching GPS location:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch GPS location' },
      { status: 500 }
    );
  }
}
