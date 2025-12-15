import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET - Check if a technician has an excused office visit for a date
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const technicianId = searchParams.get('technicianId');
  const visitDate = searchParams.get('visitDate');

  if (!technicianId || !visitDate) {
    return NextResponse.json({
      success: false,
      error: 'technicianId and visitDate are required',
    }, { status: 400 });
  }

  try {
    const { data, error } = await supabase
      .from('excused_office_visits')
      .select('*')
      .eq('technician_id', technicianId)
      .eq('visit_date', visitDate)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = No rows returned, which is fine
      throw new Error(`Database error: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      isExcused: !!data,
      excusedVisit: data || null,
    });
  } catch (error) {
    console.error('Error checking excused visit:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * POST - Create an excused office visit
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { technicianId, visitDate, reason, notes, excusedBy } = body;

    if (!technicianId || !visitDate || !reason) {
      return NextResponse.json({
        success: false,
        error: 'technicianId, visitDate, and reason are required',
      }, { status: 400 });
    }

    // Validate reason
    const validReasons = ['pickup_helper', 'meeting', 'manager_request', 'other'];
    if (!validReasons.includes(reason)) {
      return NextResponse.json({
        success: false,
        error: `Invalid reason. Must be one of: ${validReasons.join(', ')}`,
      }, { status: 400 });
    }

    // If "other", notes are required
    if (reason === 'other' && !notes) {
      return NextResponse.json({
        success: false,
        error: 'Notes are required when reason is "other"',
      }, { status: 400 });
    }

    // Insert or update
    const { data, error } = await supabase
      .from('excused_office_visits')
      .upsert({
        technician_id: technicianId,
        visit_date: visitDate,
        reason,
        notes: notes || null,
        excused_by: excusedBy || null,
      }, {
        onConflict: 'technician_id,visit_date',
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create excused visit: ${error.message}`);
    }

    // Update the punch_records to clear violation for this day
    const { error: updateError } = await supabase
      .from('punch_records')
      .update({
        is_violation: false,
        violation_reason: null,
      })
      .eq('technician_id', technicianId)
      .eq('punch_date', visitDate)
      .eq('gps_location_type', 'office')
      .eq('can_be_excused', true);

    if (updateError) {
      console.warn('Failed to update punch records:', updateError.message);
    }

    return NextResponse.json({
      success: true,
      excusedVisit: data,
    });
  } catch (error) {
    console.error('Error creating excused visit:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * DELETE - Remove an excused office visit
 */
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const technicianId = searchParams.get('technicianId');
  const visitDate = searchParams.get('visitDate');

  if (!technicianId || !visitDate) {
    return NextResponse.json({
      success: false,
      error: 'technicianId and visitDate are required',
    }, { status: 400 });
  }

  try {
    const { error } = await supabase
      .from('excused_office_visits')
      .delete()
      .eq('technician_id', technicianId)
      .eq('visit_date', visitDate);

    if (error) {
      throw new Error(`Failed to delete excused visit: ${error.message}`);
    }

    // Re-run violation detection for this day's punches
    // Since the excuse was removed, we need to re-evaluate
    const { error: updateError } = await supabase
      .from('punch_records')
      .update({
        is_violation: true,
        violation_reason: 'Clocked in at OFFICE - should go direct to job',
      })
      .eq('technician_id', technicianId)
      .eq('punch_date', visitDate)
      .eq('gps_location_type', 'office')
      .eq('can_be_excused', true);

    if (updateError) {
      console.warn('Failed to update punch records:', updateError.message);
    }

    return NextResponse.json({
      success: true,
      message: 'Excused visit removed',
    });
  } catch (error) {
    console.error('Error deleting excused visit:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
