import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const supabase = createServerClient();

  try {
    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get('activeOnly') !== 'false';
    const withPerformance = searchParams.get('withPerformance') === 'true';

    if (withPerformance) {
      // Use the performance view
      const { data, error } = await supabase
        .from('technician_performance')
        .select('*');

      if (error) throw error;

      return NextResponse.json({
        success: true,
        technicians: data || [],
        count: data?.length || 0,
      });
    }

    // Regular technician query
    let query = supabase
      .from('technicians')
      .select('*')
      .order('name');

    if (activeOnly) {
      query = query.eq('active', true);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({
      success: true,
      technicians: data || [],
      count: data?.length || 0,
    });
  } catch (error: any) {
    console.error('Error fetching technicians:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch technicians' },
      { status: 500 }
    );
  }
}

// PATCH to update technician (e.g., link Verizon vehicle ID, configure office visit tracking)
export async function PATCH(req: NextRequest) {
  const supabase = createServerClient();

  try {
    const body = await req.json();
    const {
      id,
      verizon_vehicle_id,
      verizon_driver_id,
      active,
      exclude_from_office_visits,
      takes_truck_home,
      home_latitude,
      home_longitude,
      home_address,
    } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const updateData: any = { updated_at: new Date().toISOString() };
    if (verizon_vehicle_id !== undefined) updateData.verizon_vehicle_id = verizon_vehicle_id;
    if (verizon_driver_id !== undefined) updateData.verizon_driver_id = verizon_driver_id;
    if (active !== undefined) updateData.active = active;
    if (exclude_from_office_visits !== undefined) updateData.exclude_from_office_visits = exclude_from_office_visits;
    if (takes_truck_home !== undefined) updateData.takes_truck_home = takes_truck_home;
    if (home_latitude !== undefined) updateData.home_latitude = home_latitude;
    if (home_longitude !== undefined) updateData.home_longitude = home_longitude;
    if (home_address !== undefined) updateData.home_address = home_address;

    const { data, error } = await supabase
      .from('technicians')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      technician: data,
    });
  } catch (error: any) {
    console.error('Error updating technician:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update technician' },
      { status: 500 }
    );
  }
}
