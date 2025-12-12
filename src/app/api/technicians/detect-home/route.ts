import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getVehicleSegments } from '@/lib/verizon-connect';
import { detectHomeLocation, DailyFirstSegment } from '@/lib/geo-utils';
import { subDays, format } from 'date-fns';

/**
 * GET /api/technicians/detect-home?technicianId=xxx
 * Analyzes GPS data to suggest a home location for a technician
 */
export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const searchParams = req.nextUrl.searchParams;
  const technicianId = searchParams.get('technicianId');

  if (!technicianId) {
    return NextResponse.json(
      { error: 'technicianId is required' },
      { status: 400 }
    );
  }

  try {
    // Get technician with their Verizon vehicle ID
    const { data: technician, error: techError } = await supabase
      .from('technicians')
      .select('id, name, verizon_vehicle_id')
      .eq('id', technicianId)
      .single();

    if (techError || !technician) {
      return NextResponse.json(
        { error: 'Technician not found' },
        { status: 404 }
      );
    }

    if (!technician.verizon_vehicle_id) {
      return NextResponse.json({
        success: true,
        suggestion: null,
        message: 'Technician does not have a truck assigned',
      });
    }

    // Analyze last 30 days of GPS data
    const today = new Date();
    const dailyFirstSegments: DailyFirstSegment[] = [];

    console.log(`Detecting home location for ${technician.name}...`);

    // Go back 30 days
    for (let i = 1; i <= 30; i++) {
      const date = subDays(today, i);
      const dayOfWeek = date.getDay();

      // Skip weekends
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        continue;
      }

      const dateStr = format(date, 'yyyy-MM-dd');

      try {
        // Get segments for this day
        const segmentsData = await getVehicleSegments(
          technician.verizon_vehicle_id,
          `${dateStr}T00:00:00Z`
        );
        const segments = segmentsData.Segments || [];

        if (segments.length === 0) {
          continue;
        }

        // Sort by start time and get the first segment
        const sortedSegments = [...segments]
          .filter(seg => seg.StartDateUtc && seg.StartLocation)
          .sort((a, b) =>
            new Date(a.StartDateUtc!).getTime() - new Date(b.StartDateUtc!).getTime()
          );

        if (sortedSegments.length > 0) {
          const firstSegment = sortedSegments[0];
          if (firstSegment.StartLocation) {
            dailyFirstSegments.push({
              date: dateStr,
              startLat: firstSegment.StartLocation.Latitude,
              startLon: firstSegment.StartLocation.Longitude,
              address: firstSegment.StartLocation.AddressLine1 || '',
            });
          }
        }
      } catch (segError: any) {
        console.log(`  Skipping ${dateStr}: ${segError.message}`);
      }

      // Small delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`  Analyzed ${dailyFirstSegments.length} days of GPS data`);

    // Detect home location from the collected data
    const suggestion = detectHomeLocation(dailyFirstSegments);

    if (!suggestion) {
      return NextResponse.json({
        success: true,
        suggestion: null,
        message: 'Could not detect a consistent home location. The truck may park at the office most days.',
      });
    }

    // Build a friendly message
    const confidenceText = suggestion.confidence === 'high' ? 'Very likely' :
                          suggestion.confidence === 'medium' ? 'Likely' : 'Possibly';
    const message = `${confidenceText} home location. Truck started here on ${suggestion.daysDetected} of ${suggestion.totalDaysAnalyzed} work days.`;

    return NextResponse.json({
      success: true,
      suggestion: {
        latitude: suggestion.latitude,
        longitude: suggestion.longitude,
        address: suggestion.address,
        confidence: suggestion.confidence,
        message,
        daysDetected: suggestion.daysDetected,
        totalDaysAnalyzed: suggestion.totalDaysAnalyzed,
      },
    });
  } catch (error: any) {
    console.error('Error detecting home location:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to detect home location' },
      { status: 500 }
    );
  }
}
