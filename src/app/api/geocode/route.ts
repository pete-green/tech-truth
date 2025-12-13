import { NextRequest, NextResponse } from 'next/server';
import { geocodeAddress, isGeocodingError } from '@/lib/geocoding';

/**
 * POST /api/geocode
 * Geocode an address to get coordinates
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { address } = body;

    if (!address) {
      return NextResponse.json(
        { error: 'Address is required' },
        { status: 400 }
      );
    }

    const result = await geocodeAddress(address);

    if (isGeocodingError(result)) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          suggestions: result.suggestions,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      latitude: result.latitude,
      longitude: result.longitude,
      displayName: result.displayName,
      confidence: result.confidence,
    });
  } catch (error: any) {
    console.error('Geocode API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to geocode address' },
      { status: 500 }
    );
  }
}
