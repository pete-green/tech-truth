import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { format, parseISO, subDays, startOfDay, endOfDay } from 'date-fns';

export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const searchParams = req.nextUrl.searchParams;

  // Parse date range (default to last 30 days)
  const endDateStr = searchParams.get('endDate') || format(new Date(), 'yyyy-MM-dd');
  const startDateStr = searchParams.get('startDate') || format(subDays(parseISO(endDateStr), 30), 'yyyy-MM-dd');
  const technicianId = searchParams.get('technicianId');

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
    }

    const { data: discrepancies, error: discError } = await discrepancyQuery
      .order('job_date', { ascending: false });

    if (discError) throw discError;

    // Get all jobs in the date range to calculate on-time percentage
    let jobsQuery = supabase
      .from('jobs')
      .select('id, technician_id, job_date, is_first_job_of_day, actual_arrival')
      .gte('job_date', startDateStr)
      .lte('job_date', endDateStr)
      .eq('is_first_job_of_day', true);

    if (technicianId) {
      jobsQuery = jobsQuery.eq('technician_id', technicianId);
    }

    const { data: allFirstJobs, error: jobsError } = await jobsQuery;
    if (jobsError) throw jobsError;

    // Get all technicians for the report
    const { data: technicians } = await supabase
      .from('technicians')
      .select('id, name, st_technician_id')
      .eq('active', true)
      .not('verizon_vehicle_id', 'is', null);

    // Calculate summary metrics
    const lateDiscrepancies = discrepancies?.filter(d => d.is_late) || [];
    const totalFirstJobs = allFirstJobs?.length || 0;
    const lateFirstJobs = lateDiscrepancies.length;
    const onTimeFirstJobs = totalFirstJobs - lateFirstJobs;
    const onTimePercentage = totalFirstJobs > 0 ? Math.round((onTimeFirstJobs / totalFirstJobs) * 100) : 100;

    const avgLateMinutes = lateDiscrepancies.length > 0
      ? Math.round(lateDiscrepancies.reduce((sum, d) => sum + (d.variance_minutes || 0), 0) / lateDiscrepancies.length)
      : 0;

    const maxLateMinutes = lateDiscrepancies.length > 0
      ? Math.max(...lateDiscrepancies.map(d => d.variance_minutes || 0))
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

    // Count first jobs per technician
    for (const job of allFirstJobs || []) {
      if (job.technician_id && byTechnician[job.technician_id]) {
        byTechnician[job.technician_id].totalFirstJobs++;
      }
    }

    // Count late arrivals per technician
    const techLateMinutes: Record<string, number[]> = {};
    for (const disc of lateDiscrepancies) {
      if (disc.technician_id && byTechnician[disc.technician_id]) {
        byTechnician[disc.technician_id].lateFirstJobs++;
        if (!techLateMinutes[disc.technician_id]) {
          techLateMinutes[disc.technician_id] = [];
        }
        techLateMinutes[disc.technician_id].push(disc.variance_minutes || 0);
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
      // TODO: Calculate trend based on comparing first half vs second half of period
    }

    // Calculate by day of week
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

    for (const job of allFirstJobs || []) {
      const dayOfWeek = new Date(job.job_date).getDay();
      byDayOfWeek[dayNames[dayOfWeek]].total++;
    }

    for (const disc of lateDiscrepancies) {
      const dayOfWeek = new Date(disc.job_date).getDay();
      byDayOfWeek[dayNames[dayOfWeek]].late++;
    }

    for (const day of dayNames) {
      if (byDayOfWeek[day].total > 0) {
        byDayOfWeek[day].percentage = Math.round(
          ((byDayOfWeek[day].total - byDayOfWeek[day].late) / byDayOfWeek[day].total) * 100
        );
      }
    }

    // Calculate daily trend
    const dailyTrend: { date: string; totalLate: number; avgVariance: number }[] = [];
    const dailyStats: Record<string, { late: number; totalVariance: number }> = {};

    for (const disc of lateDiscrepancies) {
      if (!dailyStats[disc.job_date]) {
        dailyStats[disc.job_date] = { late: 0, totalVariance: 0 };
      }
      dailyStats[disc.job_date].late++;
      dailyStats[disc.job_date].totalVariance += disc.variance_minutes || 0;
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
    });
  } catch (error: any) {
    console.error('Error generating report:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate report' },
      { status: 500 }
    );
  }
}
