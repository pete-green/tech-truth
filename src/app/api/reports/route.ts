import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { format, parseISO, subDays, startOfDay, endOfDay, differenceInMinutes } from 'date-fns';

export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const searchParams = req.nextUrl.searchParams;

  // Parse date range (default to last 30 days)
  const endDateStr = searchParams.get('endDate') || format(new Date(), 'yyyy-MM-dd');
  const startDateStr = searchParams.get('startDate') || format(subDays(parseISO(endDateStr), 30), 'yyyy-MM-dd');
  const technicianId = searchParams.get('technicianId');
  const technicianIds = searchParams.get('technicianIds'); // comma-separated list

  try {
    // Build the base query for discrepancies
    let discrepancyQuery = supabase
      .from('arrival_discrepancies')
      .select(`
        id,
        job_date,
        scheduled_arrival,
        actual_arrival,
        variance_minutes,
        is_late,
        is_first_job,
        notes,
        reviewed,
        technician_id,
        technicians (
          id,
          name,
          st_technician_id
        ),
        jobs (
          id,
          job_number,
          job_address,
          customer_name
        )
      `)
      .gte('job_date', startDateStr)
      .lte('job_date', endDateStr)
      .eq('is_first_job', true);

    if (technicianId) {
      discrepancyQuery = discrepancyQuery.eq('technician_id', technicianId);
    } else if (technicianIds) {
      const ids = technicianIds.split(',').filter(id => id.trim());
      if (ids.length > 0) {
        discrepancyQuery = discrepancyQuery.in('technician_id', ids);
      }
    }

    const { data: discrepancies, error: discError } = await discrepancyQuery
      .order('job_date', { ascending: false });

    if (discError) throw discError;

    // Get all jobs in the date range to calculate on-time percentage
    // Include scheduled_start to calculate variance directly
    let jobsQuery = supabase
      .from('jobs')
      .select('id, technician_id, job_date, is_first_job_of_day, actual_arrival, scheduled_start')
      .gte('job_date', startDateStr)
      .lte('job_date', endDateStr)
      .eq('is_first_job_of_day', true);

    if (technicianId) {
      jobsQuery = jobsQuery.eq('technician_id', technicianId);
    } else if (technicianIds) {
      const ids = technicianIds.split(',').filter(id => id.trim());
      if (ids.length > 0) {
        jobsQuery = jobsQuery.in('technician_id', ids);
      }
    }

    const { data: allFirstJobs, error: jobsError } = await jobsQuery;
    if (jobsError) throw jobsError;

    // Get all technicians for the report
    const { data: technicians } = await supabase
      .from('technicians')
      .select('id, name, st_technician_id')
      .eq('active', true)
      .not('verizon_vehicle_id', 'is', null);

    // Calculate late status directly from jobs (not just discrepancies)
    // This ensures consistency between summary and details
    const LATE_THRESHOLD_MINUTES = 10;

    // Calculate variance for each job that has actual arrival data
    const jobsWithVariance = (allFirstJobs || []).map(job => {
      let varianceMinutes: number | null = null;
      let isLate = false;

      if (job.scheduled_start && job.actual_arrival) {
        const scheduled = parseISO(job.scheduled_start);
        const actual = parseISO(job.actual_arrival);
        varianceMinutes = differenceInMinutes(actual, scheduled);
        isLate = varianceMinutes > LATE_THRESHOLD_MINUTES;
      }

      return { ...job, varianceMinutes, isLate };
    });

    // Jobs with GPS-verified arrival that were late
    const lateJobs = jobsWithVariance.filter(j => j.isLate);

    // Calculate summary metrics from actual job data
    const totalFirstJobs = allFirstJobs?.length || 0;
    const lateFirstJobs = lateJobs.length;
    const onTimeFirstJobs = totalFirstJobs - lateFirstJobs;
    const onTimePercentage = totalFirstJobs > 0 ? Math.round((onTimeFirstJobs / totalFirstJobs) * 100) : 100;

    // Calculate late minutes from actual job variance
    const lateMinutesArray = lateJobs
      .filter(j => j.varianceMinutes !== null)
      .map(j => j.varianceMinutes as number);

    const avgLateMinutes = lateMinutesArray.length > 0
      ? Math.round(lateMinutesArray.reduce((sum, m) => sum + m, 0) / lateMinutesArray.length)
      : 0;

    const maxLateMinutes = lateMinutesArray.length > 0
      ? Math.max(...lateMinutesArray)
      : 0;

    // Calculate by technician
    const byTechnician: Record<string, {
      id: string;
      name: string;
      totalFirstJobs: number;
      lateFirstJobs: number;
      onTimePercentage: number;
      avgLateMinutes: number;
      trend: 'improving' | 'declining' | 'stable';
    }> = {};

    // Initialize all technicians
    for (const tech of technicians || []) {
      byTechnician[tech.id] = {
        id: tech.id,
        name: tech.name,
        totalFirstJobs: 0,
        lateFirstJobs: 0,
        onTimePercentage: 100,
        avgLateMinutes: 0,
        trend: 'stable',
      };
    }

    // Count first jobs and late arrivals per technician using actual job data
    const techLateMinutes: Record<string, number[]> = {};
    for (const job of jobsWithVariance) {
      if (job.technician_id && byTechnician[job.technician_id]) {
        byTechnician[job.technician_id].totalFirstJobs++;

        if (job.isLate && job.varianceMinutes !== null) {
          byTechnician[job.technician_id].lateFirstJobs++;
          if (!techLateMinutes[job.technician_id]) {
            techLateMinutes[job.technician_id] = [];
          }
          techLateMinutes[job.technician_id].push(job.varianceMinutes);
        }
      }
    }

    // Calculate percentages and averages
    for (const techId of Object.keys(byTechnician)) {
      const tech = byTechnician[techId];
      if (tech.totalFirstJobs > 0) {
        tech.onTimePercentage = Math.round(((tech.totalFirstJobs - tech.lateFirstJobs) / tech.totalFirstJobs) * 100);
      }
      if (techLateMinutes[techId] && techLateMinutes[techId].length > 0) {
        tech.avgLateMinutes = Math.round(
          techLateMinutes[techId].reduce((sum, m) => sum + m, 0) / techLateMinutes[techId].length
        );
      }
    }

    // Calculate by day of week using actual job data
    const byDayOfWeek: Record<string, { total: number; late: number; percentage: number }> = {
      sunday: { total: 0, late: 0, percentage: 100 },
      monday: { total: 0, late: 0, percentage: 100 },
      tuesday: { total: 0, late: 0, percentage: 100 },
      wednesday: { total: 0, late: 0, percentage: 100 },
      thursday: { total: 0, late: 0, percentage: 100 },
      friday: { total: 0, late: 0, percentage: 100 },
      saturday: { total: 0, late: 0, percentage: 100 },
    };

    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

    for (const job of jobsWithVariance) {
      const dayOfWeek = new Date(job.job_date).getDay();
      byDayOfWeek[dayNames[dayOfWeek]].total++;
      if (job.isLate) {
        byDayOfWeek[dayNames[dayOfWeek]].late++;
      }
    }

    for (const day of dayNames) {
      if (byDayOfWeek[day].total > 0) {
        byDayOfWeek[day].percentage = Math.round(
          ((byDayOfWeek[day].total - byDayOfWeek[day].late) / byDayOfWeek[day].total) * 100
        );
      }
    }

    // Calculate daily trend using actual job data
    const dailyTrend: { date: string; totalLate: number; avgVariance: number }[] = [];
    const dailyStats: Record<string, { late: number; totalVariance: number }> = {};

    for (const job of jobsWithVariance) {
      if (job.isLate && job.varianceMinutes !== null) {
        if (!dailyStats[job.job_date]) {
          dailyStats[job.job_date] = { late: 0, totalVariance: 0 };
        }
        dailyStats[job.job_date].late++;
        dailyStats[job.job_date].totalVariance += job.varianceMinutes;
      }
    }

    const sortedDates = Object.keys(dailyStats).sort();
    for (const date of sortedDates) {
      dailyTrend.push({
        date,
        totalLate: dailyStats[date].late,
        avgVariance: dailyStats[date].late > 0
          ? Math.round(dailyStats[date].totalVariance / dailyStats[date].late)
          : 0,
      });
    }

    // Convert byTechnician to array and sort by late count
    const byTechnicianArray = Object.values(byTechnician)
      .filter(t => t.totalFirstJobs > 0)
      .sort((a, b) => b.lateFirstJobs - a.lateFirstJobs);

    // Build available technicians list (only those with jobs in this period)
    const availableTechnicians = byTechnicianArray.map(t => ({
      id: t.id,
      name: t.name,
      totalFirstJobs: t.totalFirstJobs,
      lateFirstJobs: t.lateFirstJobs,
    }));

    return NextResponse.json({
      success: true,
      period: {
        start: startDateStr,
        end: endDateStr,
        totalDays: Math.ceil(
          (parseISO(endDateStr).getTime() - parseISO(startDateStr).getTime()) / (1000 * 60 * 60 * 24)
        ) + 1,
      },
      summary: {
        totalFirstJobs,
        lateFirstJobs,
        onTimeFirstJobs,
        onTimePercentage,
        avgLateMinutes,
        maxLateMinutes,
      },
      byTechnician: byTechnicianArray,
      byDayOfWeek,
      dailyTrend,
      recentDiscrepancies: discrepancies?.slice(0, 20) || [],
      availableTechnicians,
    });
  } catch (error: any) {
    console.error('Error generating report:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate report' },
      { status: 500 }
    );
  }
}
