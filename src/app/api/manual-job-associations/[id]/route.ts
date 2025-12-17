import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// DELETE - Remove a manual job association
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createServerClient();
  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      { error: 'Association ID is required' },
      { status: 400 }
    );
  }

  try {
    // Get the association first to find the job
    const { data: association, error: fetchError } = await supabase
      .from('manual_job_associations')
      .select('job_id, gps_timestamp')
      .eq('id', id)
      .single();

    if (fetchError || !association) {
      return NextResponse.json(
        { error: 'Association not found' },
        { status: 404 }
      );
    }

    // Delete the association
    const { error: deleteError } = await supabase
      .from('manual_job_associations')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    // Optionally clear the job's actual_arrival if it was set by this association
    // We check if the job's actual_arrival matches the association's timestamp
    if (association.job_id) {
      const { data: job } = await supabase
        .from('jobs')
        .select('actual_arrival')
        .eq('id', association.job_id)
        .single();

      if (job?.actual_arrival) {
        const jobArrival = new Date(job.actual_arrival).getTime();
        const assocTimestamp = new Date(association.gps_timestamp).getTime();

        // If they match (within 1 second), clear the arrival time
        if (Math.abs(jobArrival - assocTimestamp) < 1000) {
          await supabase
            .from('jobs')
            .update({ actual_arrival: null })
            .eq('id', association.job_id);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Association removed successfully',
    });
  } catch (error: any) {
    console.error('Error deleting manual job association:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete association' },
      { status: 500 }
    );
  }
}
