import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// POST - Create a new manual job association
export async function POST(req: NextRequest) {
  const supabase = createServerClient();

  try {
    const body = await req.json();
    const {
      technicianId,
      jobId,
      jobDate,
      gpsLatitude,
      gpsLongitude,
      gpsTimestamp,
      gpsAddress,
      notes,
    } = body;

    // Validate required fields
    if (!technicianId || !jobId || !jobDate || !gpsLatitude || !gpsLongitude || !gpsTimestamp) {
      return NextResponse.json(
        { error: 'Missing required fields: technicianId, jobId, jobDate, gpsLatitude, gpsLongitude, gpsTimestamp' },
        { status: 400 }
      );
    }

    // Check if association already exists
    const { data: existing } = await supabase
      .from('manual_job_associations')
      .select('id')
      .eq('job_id', jobId)
      .eq('gps_timestamp', gpsTimestamp)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: 'Association already exists for this job and timestamp' },
        { status: 409 }
      );
    }

    // Create the association
    const { data: association, error: assocError } = await supabase
      .from('manual_job_associations')
      .insert({
        technician_id: technicianId,
        job_id: jobId,
        job_date: jobDate,
        gps_latitude: gpsLatitude,
        gps_longitude: gpsLongitude,
        gps_timestamp: gpsTimestamp,
        gps_address: gpsAddress || null,
        notes: notes || null,
      })
      .select()
      .single();

    if (assocError) throw assocError;

    // Update the job's actual_arrival if not already set
    const { data: job } = await supabase
      .from('jobs')
      .select('actual_arrival, job_number')
      .eq('id', jobId)
      .single();

    if (job && !job.actual_arrival) {
      await supabase
        .from('jobs')
        .update({ actual_arrival: gpsTimestamp })
        .eq('id', jobId);
    }

    return NextResponse.json({
      success: true,
      association: {
        id: association.id,
        jobId: association.job_id,
        jobNumber: job?.job_number,
        createdAt: association.created_at,
      },
    });
  } catch (error: any) {
    console.error('Error creating manual job association:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create association' },
      { status: 500 }
    );
  }
}

// GET - List associations for a technician/date
export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const searchParams = req.nextUrl.searchParams;

  const technicianId = searchParams.get('technicianId');
  const date = searchParams.get('date');

  if (!technicianId || !date) {
    return NextResponse.json(
      { error: 'technicianId and date are required' },
      { status: 400 }
    );
  }

  try {
    const { data: associations, error } = await supabase
      .from('manual_job_associations')
      .select(`
        id,
        technician_id,
        job_id,
        job_date,
        gps_latitude,
        gps_longitude,
        gps_timestamp,
        gps_address,
        created_at,
        notes
      `)
      .eq('technician_id', technicianId)
      .eq('job_date', date);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      associations: associations || [],
    });
  } catch (error: any) {
    console.error('Error fetching manual job associations:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch associations' },
      { status: 500 }
    );
  }
}
