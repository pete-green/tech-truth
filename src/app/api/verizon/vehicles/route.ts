import { NextRequest, NextResponse } from 'next/server';
import { getVehicles, getVehicle, getAllVehicleLocations, getVehicleLocation } from '@/lib/verizon-connect';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const vehicleId = searchParams.get('id');
    const includeLocations = searchParams.get('locations') === 'true';

    if (vehicleId) {
      // Get single vehicle with optional location
      const vehicle = await getVehicle(vehicleId);

      if (includeLocations) {
        const location = await getVehicleLocation(vehicleId);
        return NextResponse.json({
          success: true,
          vehicle: { ...vehicle, location },
        });
      }

      return NextResponse.json({ success: true, vehicle });
    }

    // Get all vehicles
    const vehicles = await getVehicles();

    // Optionally include current locations
    if (includeLocations) {
      const locations = await getAllVehicleLocations();
      return NextResponse.json({
        success: true,
        vehicles,
        locations,
        count: Array.isArray(vehicles) ? vehicles.length : 0,
      });
    }

    return NextResponse.json({
      success: true,
      vehicles,
      count: Array.isArray(vehicles) ? vehicles.length : 0,
    });
  } catch (error: any) {
    console.error('Verizon Vehicles API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch vehicles' },
      { status: 500 }
    );
  }
}
