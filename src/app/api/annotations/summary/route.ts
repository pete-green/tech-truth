import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET - Get summary of all annotations and proposed punches for manager review
 */
export async function GET() {
  try {
    // Fetch all punch annotations with related punch record and technician info
    const { data: annotations, error: annotationsError } = await supabase
      .from('punch_annotations')
      .select(`
        id,
        note,
        proposed_time,
        annotation_type,
        created_at,
        created_by,
        punch_record_id,
        punch_records!inner (
          id,
          punch_type,
          punch_time,
          punch_date,
          technician_id,
          technicians (
            id,
            name
          )
        )
      `)
      .order('created_at', { ascending: false });

    if (annotationsError) {
      console.error('Error fetching annotations:', annotationsError);
      throw new Error(`Failed to fetch annotations: ${annotationsError.message}`);
    }

    // Fetch all proposed punches with technician info
    const { data: proposedPunches, error: proposedError } = await supabase
      .from('proposed_punches')
      .select(`
        id,
        technician_id,
        date,
        punch_type,
        proposed_time,
        note,
        status,
        created_at,
        created_by,
        technicians (
          id,
          name
        )
      `)
      .order('created_at', { ascending: false });

    if (proposedError) {
      console.error('Error fetching proposed punches:', proposedError);
      throw new Error(`Failed to fetch proposed punches: ${proposedError.message}`);
    }

    // Calculate stats
    const stats = {
      totalObservations: annotations?.filter(a => a.annotation_type === 'observation').length || 0,
      totalTimeCorrections: annotations?.filter(a => a.annotation_type === 'time_correction').length || 0,
      totalFlagged: annotations?.filter(a => a.annotation_type === 'flagged').length || 0,
      totalProposedPunches: proposedPunches?.length || 0,
      pendingProposedPunches: proposedPunches?.filter(p => p.status === 'pending').length || 0,
    };

    // Transform annotations for response
    const transformedAnnotations = (annotations || []).map(a => {
      const punchRecord = a.punch_records as any;
      const technician = punchRecord?.technicians as any;
      return {
        id: a.id,
        type: a.annotation_type,
        note: a.note,
        proposed_time: a.proposed_time,
        created_at: a.created_at,
        created_by: a.created_by,
        punchRecordId: a.punch_record_id,
        technicianId: punchRecord?.technician_id,
        technicianName: technician?.name || 'Unknown',
        punchType: punchRecord?.punch_type || 'Unknown',
        punchTime: punchRecord?.punch_time,
        punchDate: punchRecord?.punch_date,
      };
    });

    // Transform proposed punches for response
    const transformedProposed = (proposedPunches || []).map(p => {
      const technician = p.technicians as any;
      return {
        id: p.id,
        technicianId: p.technician_id,
        technicianName: technician?.name || 'Unknown',
        date: p.date,
        punchType: p.punch_type,
        proposedTime: p.proposed_time,
        note: p.note,
        status: p.status,
        created_at: p.created_at,
        created_by: p.created_by,
      };
    });

    return NextResponse.json({
      success: true,
      stats,
      annotations: transformedAnnotations,
      proposedPunches: transformedProposed,
    });
  } catch (error) {
    console.error('Error in annotations summary:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
