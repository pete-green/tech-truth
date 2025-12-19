import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET - Get proposed punches for a technician on a date
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const technicianId = searchParams.get('technicianId');
  const date = searchParams.get('date');

  try {
    let query = supabase
      .from('proposed_punches')
      .select('*')
      .order('proposed_time', { ascending: true });

    if (technicianId) {
      query = query.eq('technician_id', technicianId);
    }
    if (date) {
      query = query.eq('date', date);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      proposedPunches: data || [],
    });
  } catch (error) {
    console.error('Error fetching proposed punches:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * POST - Create a proposed punch (for missing clock in/out, meal breaks)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { technicianId, date, punchType, proposedTime, note } = body;

    if (!technicianId || !date || !punchType || !proposedTime || !note) {
      return NextResponse.json({
        success: false,
        error: 'technicianId, date, punchType, proposedTime, and note are required',
      }, { status: 400 });
    }

    // Validate punch type
    const validTypes = ['ClockIn', 'ClockOut', 'MealStart', 'MealEnd'];
    if (!validTypes.includes(punchType)) {
      return NextResponse.json({
        success: false,
        error: `Invalid punchType. Must be one of: ${validTypes.join(', ')}`,
      }, { status: 400 });
    }

    // Verify technician exists
    const { data: technician, error: techError } = await supabase
      .from('technicians')
      .select('id, name')
      .eq('id', technicianId)
      .single();

    if (techError || !technician) {
      return NextResponse.json({
        success: false,
        error: 'Technician not found',
      }, { status: 404 });
    }

    // Create the proposed punch
    const { data, error } = await supabase
      .from('proposed_punches')
      .insert({
        technician_id: technicianId,
        date,
        punch_type: punchType,
        proposed_time: proposedTime,
        note,
        status: 'pending',
        created_by: 'admin',
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create proposed punch: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      proposedPunch: data,
    });
  } catch (error) {
    console.error('Error creating proposed punch:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * PATCH - Update a proposed punch status or details
 */
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, status, proposedTime, note } = body;

    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'id is required',
      }, { status: 400 });
    }

    // Build update object
    const updates: Record<string, any> = {};

    if (status) {
      const validStatuses = ['pending', 'submitted', 'applied', 'rejected'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json({
          success: false,
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        }, { status: 400 });
      }
      updates.status = status;
    }

    if (proposedTime) {
      updates.proposed_time = proposedTime;
    }

    if (note !== undefined) {
      updates.note = note;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No updates provided',
      }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('proposed_punches')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update proposed punch: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      proposedPunch: data,
    });
  } catch (error) {
    console.error('Error updating proposed punch:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * DELETE - Remove a proposed punch
 */
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({
      success: false,
      error: 'id is required',
    }, { status: 400 });
  }

  try {
    const { error } = await supabase
      .from('proposed_punches')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete proposed punch: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      message: 'Proposed punch deleted',
    });
  } catch (error) {
    console.error('Error deleting proposed punch:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
