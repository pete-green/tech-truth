import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET - Get annotations for a punch record
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const punchRecordId = searchParams.get('punchRecordId');

  if (!punchRecordId) {
    return NextResponse.json({
      success: false,
      error: 'punchRecordId is required',
    }, { status: 400 });
  }

  try {
    const { data, error } = await supabase
      .from('punch_annotations')
      .select('*')
      .eq('punch_record_id', punchRecordId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      annotations: data || [],
    });
  } catch (error) {
    console.error('Error fetching punch annotations:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * POST - Create an annotation on a punch record
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { punchRecordId, note, proposedTime, annotationType } = body;

    if (!punchRecordId || !note) {
      return NextResponse.json({
        success: false,
        error: 'punchRecordId and note are required',
      }, { status: 400 });
    }

    // Validate annotation type
    const validTypes = ['observation', 'time_correction', 'flagged'];
    const type = annotationType || 'observation';
    if (!validTypes.includes(type)) {
      return NextResponse.json({
        success: false,
        error: `Invalid annotationType. Must be one of: ${validTypes.join(', ')}`,
      }, { status: 400 });
    }

    // Verify punch record exists
    const { data: punchRecord, error: punchError } = await supabase
      .from('punch_records')
      .select('id')
      .eq('id', punchRecordId)
      .single();

    if (punchError || !punchRecord) {
      return NextResponse.json({
        success: false,
        error: 'Punch record not found',
      }, { status: 404 });
    }

    // Create the annotation
    const { data, error } = await supabase
      .from('punch_annotations')
      .insert({
        punch_record_id: punchRecordId,
        note,
        proposed_time: proposedTime || null,
        annotation_type: type,
        created_by: 'admin',
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create annotation: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      annotation: data,
    });
  } catch (error) {
    console.error('Error creating punch annotation:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * DELETE - Remove an annotation
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
      .from('punch_annotations')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete annotation: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      message: 'Annotation deleted',
    });
  } catch (error) {
    console.error('Error deleting punch annotation:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
