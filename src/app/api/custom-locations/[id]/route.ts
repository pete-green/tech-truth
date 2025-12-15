import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { CustomLocationRow, rowToCustomLocation } from '@/types/custom-location';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET - Get a single custom location
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { data, error } = await supabase
      .from('custom_locations')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Custom location not found' },
          { status: 404 }
        );
      }
      console.error('Error fetching custom location:', error);
      return NextResponse.json(
        { error: 'Failed to fetch custom location' },
        { status: 500 }
      );
    }

    const location = rowToCustomLocation(data as CustomLocationRow);

    return NextResponse.json({
      success: true,
      location,
    });
  } catch (error) {
    console.error('Error in custom location GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update a custom location
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const {
      name,
      category,
      logoUrl,
      centerLatitude,
      centerLongitude,
      radiusFeet,
      boundaryType,
      boundaryPolygon,
      address,
    } = body;

    // Validate category if provided
    const validCategories = ['gas_station', 'supply_house', 'restaurant', 'parts_store', 'other'];
    if (category && !validCategories.includes(category)) {
      return NextResponse.json(
        { error: `Invalid category. Must be one of: ${validCategories.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate boundary type if provided
    const validBoundaryTypes = ['circle', 'polygon'];
    if (boundaryType && !validBoundaryTypes.includes(boundaryType)) {
      return NextResponse.json(
        { error: `Invalid boundary type. Must be one of: ${validBoundaryTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate polygon if boundary type is polygon
    if (boundaryType === 'polygon' && boundaryPolygon !== undefined) {
      if (!Array.isArray(boundaryPolygon) || boundaryPolygon.length < 3) {
        return NextResponse.json(
          { error: 'Polygon boundary requires at least 3 coordinate points' },
          { status: 400 }
        );
      }
    }

    // Build update object (only include provided fields)
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (category !== undefined) updateData.category = category;
    if (logoUrl !== undefined) updateData.logo_url = logoUrl;
    if (centerLatitude !== undefined) updateData.center_latitude = centerLatitude;
    if (centerLongitude !== undefined) updateData.center_longitude = centerLongitude;
    if (radiusFeet !== undefined) updateData.radius_feet = radiusFeet;
    if (boundaryType !== undefined) updateData.boundary_type = boundaryType;
    if (boundaryPolygon !== undefined) updateData.boundary_polygon = boundaryPolygon;
    if (address !== undefined) updateData.address = address;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('custom_locations')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Custom location not found' },
          { status: 404 }
        );
      }
      console.error('Error updating custom location:', error);
      return NextResponse.json(
        { error: 'Failed to update custom location' },
        { status: 500 }
      );
    }

    const location = rowToCustomLocation(data as CustomLocationRow);

    return NextResponse.json({
      success: true,
      location,
    });
  } catch (error) {
    console.error('Error in custom location PUT:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a custom location
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { error } = await supabase
      .from('custom_locations')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting custom location:', error);
      return NextResponse.json(
        { error: 'Failed to delete custom location' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Custom location deleted',
    });
  } catch (error) {
    console.error('Error in custom location DELETE:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
