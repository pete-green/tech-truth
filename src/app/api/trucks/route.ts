import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

// GET - Fetch all trucks
export async function GET() {
  try {
    const supabase = createServerClient();

    const { data: trucks, error } = await supabase
      .from('trucks')
      .select('*')
      .eq('active', true)
      .order('truck_number');

    if (error) {
      console.error('Error fetching trucks:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ trucks });
  } catch (error) {
    console.error('Trucks API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch trucks' },
      { status: 500 }
    );
  }
}
