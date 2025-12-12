import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { format, parseISO } from 'date-fns';
import { DayDetail, JobDetail } from '@/types/reports';

export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const searchParams = req.nextUrl.searchParams;

  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const technicianId = searchParams.get('technicianId');

  if (!startDate || !endDate || !technicianId) {
    return NextResponse.json(
      { error: 'startDate, endDate, and technicianId are required' },
      { status: 400 }
    );
  }

  try {
    // Get technician info
    const { data: technician, error: techError } = await supabase
      .from('technicians')
      .select('id, name')
      .eq('id', technicianId)
      .single();

    if (techError || !technician) {
      return NextResponse.json(
        { error: 'Technician not found' },
        { status: 404 }
      );
    }

    // Get all jobs for this technician in the date range
    const { data: jobs, error: jobsError } = await supabase
      .from('jobs')
      .select(`
        id,
        job_number,
        customer_name,
        job_address,
        scheduled_start,
        actual_arrival,
        job_date,
        is_first_job_of_day,
        job_latitude,
        job_longitude,
        status
      `)
      .eq('technician_id', technicianId)
      .gte('job_date', startDate)
      .lte('job_date', endDate)
      .order('job_date', { ascending: true })
      .order('scheduled_start', { ascending: true });

    if (jobsError) throw jobsError;

    // Get discrepancies for late arrival info
    const { data: discrepancies, error: discError } = await supabase
      .from('arrival_discrepancies')
      .select('job_id, variance_minutes, is_late')
      .eq('technician_id', technicianId)
      .gte('job_date', startDate)
      .lte('job_date', endDate);

    if (discError) throw discError;

    // Create a map of job_id to discrepancy info
    const discrepancyMap = new Map<string, { varianceMinutes: number; isLate: boolean }>();
    for (const disc of discrepancies || []) {
      if (disc.job_id) {
        discrepancyMap.set(disc.job_id, {
          varianceMinutes: disc.variance_minutes || 0,
          isLate: disc.is_late || false,
        });
      }
    }

    // Group jobs by date
    const dayMap = new Map<string, JobDetail[]>();

    for (const job of jobs || []) {
      const date = job.job_date;
      if (!dayMap.has(date)) {
        dayMap.set(date, []);
      }

      const disc = discrepancyMap.get(job.id);

      const jobDetail: JobDetail = {
        id: job.id,
        jobNumber: job.job_number || '',
        customerName: job.customer_name,
        jobAddress: job.job_address,
        scheduledStart: job.scheduled_start,
        actualArrival: job.actual_arrival,
        varianceMinutes: disc?.varianceMinutes ?? null,
        isLate: disc?.isLate ?? false,
        isFirstJob: job.is_first_job_of_day || false,
        jobLatitude: job.job_latitude,
        jobLongitude: job.job_longitude,
        status: job.status,
      };

      dayMap.get(date)!.push(jobDetail);
    }

    // Convert to array of DayDetail
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const days: DayDetail[] = [];

    for (const [date, dayJobs] of dayMap.entries()) {
      const dateObj = parseISO(date);
      const firstJob = dayJobs.find(j => j.isFirstJob);

      days.push({
        date,
        dayOfWeek: dayNames[dateObj.getDay()],
        jobs: dayJobs,
        summary: {
          totalJobs: dayJobs.length,
          firstJobLate: firstJob?.isLate ?? false,
          firstJobVariance: firstJob?.varianceMinutes ?? null,
        },
      });
    }

    // Sort by date descending (most recent first)
    days.sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json({
      success: true,
      technicianId: technician.id,
      technicianName: technician.name,
      days,
    });
  } catch (error: any) {
    console.error('Error fetching technician details:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch technician details' },
      { status: 500 }
    );
  }
}
