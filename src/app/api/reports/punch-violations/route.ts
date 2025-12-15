import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET - Fetch punch violations for a date range
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const technicianId = searchParams.get('technicianId');

  if (!startDate || !endDate) {
    return NextResponse.json({
      success: false,
      error: 'startDate and endDate are required',
    }, { status: 400 });
  }

  try {
    // Build query for punch records with violations
    let query = supabase
      .from('punch_records')
      .select(`
        id,
        technician_id,
        punch_date,
        punch_time,
        punch_type,
        gps_latitude,
        gps_longitude,
        gps_address,
        gps_location_type,
        is_violation,
        violation_reason,
        expected_location_type,
        can_be_excused,
        clock_in_time,
        clock_out_time,
        origin
      `)
      .gte('punch_date', startDate)
      .lte('punch_date', endDate)
      .eq('is_violation', true)
      .order('punch_date', { ascending: true })
      .order('punch_time', { ascending: true });

    // Filter by technician if provided
    if (technicianId) {
      query = query.eq('technician_id', technicianId);
    }

    const { data: violations, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch violations: ${error.message}`);
    }

    // Get technician names
    const techIds = [...new Set(violations?.map(v => v.technician_id).filter(Boolean))];
    const { data: technicians } = await supabase
      .from('technicians')
      .select('id, name')
      .in('id', techIds);

    const techMap = new Map(technicians?.map(t => [t.id, t.name]) || []);

    // Get excused visits for these tech/date combinations
    const techDatePairs = violations?.map(v => ({
      technicianId: v.technician_id,
      date: v.punch_date,
    })) || [];

    // Fetch all excused visits for the date range
    const { data: excusedVisits } = await supabase
      .from('excused_office_visits')
      .select('technician_id, visit_date, reason, notes')
      .gte('visit_date', startDate)
      .lte('visit_date', endDate);

    // Create a lookup for excused visits
    const excusedMap = new Map(
      excusedVisits?.map(e => [`${e.technician_id}-${e.visit_date}`, e]) || []
    );

    // Enrich violations with technician names and excused status
    const enrichedViolations = violations?.map(v => {
      const excused = excusedMap.get(`${v.technician_id}-${v.punch_date}`);
      return {
        id: v.id,
        technicianId: v.technician_id,
        technicianName: techMap.get(v.technician_id) || 'Unknown',
        date: v.punch_date,
        type: v.punch_type.toLowerCase().replace(/([A-Z])/g, '_$1').replace(/^_/, ''),
        timestamp: v.punch_time,
        reason: v.violation_reason || 'Unknown violation',
        gpsLocationType: v.gps_location_type,
        address: v.gps_address,
        canBeExcused: v.can_be_excused || false,
        isExcused: !!excused,
        excusedReason: excused?.reason || null,
        punchId: v.id,
      };
    }) || [];

    return NextResponse.json({
      success: true,
      violations: enrichedViolations,
      totalCount: enrichedViolations.length,
      activeCount: enrichedViolations.filter(v => !v.isExcused).length,
      excusedCount: enrichedViolations.filter(v => v.isExcused).length,
    });
  } catch (error) {
    console.error('Error fetching violations:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
