import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { CustomLocationRow, rowToCustomLocation } from '@/types/custom-location';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET - List all custom locations
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('custom_locations')
      .select('*')
      .order('name');

    if (error) {
      console.error('Error fetching custom locations:', error);
      return NextResponse.json(
        { error: 'Failed to fetch custom locations' },
        { status: 500 }
      );
    }

    const locations = (data as CustomLocationRow[]).map(rowToCustomLocation);

    return NextResponse.json({
      success: true,
      locations,
    });
  } catch (error) {
    console.error('Error in custom locations GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create a new custom location
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      name,
      category,
      logoUrl,
      centerLatitude,
      centerLongitude,
      radiusFeet = 300,
      boundaryType = 'circle',
      boundaryPolygon,
      address,
    } = body;

    // Validate required fields
    if (!name || centerLatitude === undefined || centerLongitude === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: name, centerLatitude, centerLongitude' },
        { status: 400 }
      );
    }

    // Validate category if provided
    const validCategories = ['gas_station', 'supply_house', 'restaurant', 'parts_store', 'other'];
    if (category && !validCategories.includes(category)) {
      return NextResponse.json(
        { error: `Invalid category. Must be one of: ${validCategories.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate boundary type
    const validBoundaryTypes = ['circle', 'polygon'];
    if (!validBoundaryTypes.includes(boundaryType)) {
      return NextResponse.json(
        { error: `Invalid boundary type. Must be one of: ${validBoundaryTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate polygon if boundary type is polygon
    if (boundaryType === 'polygon') {
      if (!boundaryPolygon || !Array.isArray(boundaryPolygon) || boundaryPolygon.length < 3) {
        return NextResponse.json(
          { error: 'Polygon boundary requires at least 3 coordinate points' },
          { status: 400 }
        );
      }
    }

    // Insert the new location
    const { data, error } = await supabase
      .from('custom_locations')
      .insert({
        name,
        category: category || null,
        logo_url: logoUrl || null,
        center_latitude: centerLatitude,
        center_longitude: centerLongitude,
        radius_feet: radiusFeet,
        boundary_type: boundaryType,
        boundary_polygon: boundaryPolygon || null,
        address: address || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating custom location:', error);

      // Check for unique constraint violation
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A location with this name already exists at these coordinates' },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to create custom location' },
        { status: 500 }
      );
    }

    const location = rowToCustomLocation(data as CustomLocationRow);

    return NextResponse.json({
      success: true,
      location,
    });
  } catch (error) {
    console.error('Error in custom locations POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
