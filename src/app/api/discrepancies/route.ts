import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { format, parseISO } from 'date-fns';

export async function GET(req: NextRequest) {
  const supabase = createServerClient();

  try {
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date');
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const technicianId = searchParams.get('technicianId');
    const firstJobOnly = searchParams.get('firstJobOnly') === 'true';
    const unreviewedOnly = searchParams.get('unreviewedOnly') === 'true';

    let query = supabase
      .from('arrival_discrepancies')
      .select(`
        *,
        technician:technicians(id, name, st_technician_id),
        job:jobs(id, job_number, customer_name, job_address, scheduled_start, actual_arrival)
      `)
      .order('variance_minutes', { ascending: false });

    // Filter by date range
    if (dateParam) {
      const date = parseISO(dateParam);
      query = query.eq('job_date', format(date, 'yyyy-MM-dd'));
    } else if (startDateParam && endDateParam) {
      query = query
        .gte('job_date', startDateParam)
        .lte('job_date', endDateParam);
    } else {
      // Default to today
      query = query.eq('job_date', format(new Date(), 'yyyy-MM-dd'));
    }

    // Filter by technician
    if (technicianId) {
      query = query.eq('technician_id', technicianId);
    }

    // Filter for first jobs only
    if (firstJobOnly) {
      query = query.eq('is_first_job', true);
    }

    // Filter for unreviewed only
    if (unreviewedOnly) {
      query = query.eq('reviewed', false);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({
      success: true,
      discrepancies: data || [],
      count: data?.length || 0,
    });
  } catch (error: any) {
    console.error('Error fetching discrepancies:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch discrepancies' },
      { status: 500 }
    );
  }
}

// PATCH to update a discrepancy (mark as reviewed, add notes)
export async function PATCH(req: NextRequest) {
  const supabase = createServerClient();

  try {
    const body = await req.json();
    const { id, reviewed, notes, reviewed_by } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    // Build update object inline to avoid type issues
    const now = new Date().toISOString();

    // First, update the record
    const { error: updateError } = await supabase
      .from('arrival_discrepancies')
      .update({
        reviewed: reviewed ?? undefined,
        reviewed_at: reviewed ? now : undefined,
        reviewed_by: reviewed && reviewed_by ? reviewed_by : undefined,
        notes: notes ?? undefined,
      })
      .eq('id', id);

    if (updateError) throw updateError;

    // Then fetch the updated record
    const { data, error: fetchError } = await supabase
      .from('arrival_discrepancies')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    return NextResponse.json({
      success: true,
      discrepancy: data,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update discrepancy';
    console.error('Error updating discrepancy:', error);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
