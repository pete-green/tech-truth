import { NextRequest, NextResponse } from 'next/server';
import { getAllVehicleLocations, getVehicleLocationHistory } from '@/lib/verizon-connect';
import { createServerClient } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const vehicleId = searchParams.get('vehicleId');
    const startTime = searchParams.get('startTime');
    const endTime = searchParams.get('endTime');
    const syncToDb = searchParams.get('sync') === 'true';

    // If specific vehicle and time range, get history
    if (vehicleId && startTime && endTime) {
      const history = await getVehicleLocationHistory(vehicleId, startTime, endTime);
      return NextResponse.json({
        success: true,
        vehicleId,
        locations: history,
        count: Array.isArray(history) ? history.length : 0,
      });
    }

    // Get current locations for all vehicles
    const locations = await getAllVehicleLocations();
    const locationArray = Array.isArray(locations) ? locations : locations?.data || [];

    // Optionally sync to database
    if (syncToDb && locationArray.length > 0) {
      const supabase = createServerClient();

      for (const loc of locationArray) {
        // Find technician by Verizon vehicle ID
        const vehicleNumber = loc.VehicleNumber || loc.vehicleNumber || loc.VehicleId || loc.vehicleId;

        const { data: techData } = await supabase
          .from('technicians')
          .select('id')
          .eq('verizon_vehicle_id', vehicleNumber)
          .single();

        if (!techData) {
          // Try by verizon_driver_id
          const driverId = loc.DriverId || loc.driverId;
          if (driverId) {
            const { data: techByDriver } = await supabase
              .from('technicians')
              .select('id')
              .eq('verizon_driver_id', driverId)
              .single();

            if (!techByDriver) continue;
          } else {
            continue;
          }
        }

        const technicianId = techData?.id;
        if (!technicianId) continue;

        const timestamp = loc.Timestamp || loc.timestamp || loc.RecordedAt || new Date().toISOString();

        const { error } = await supabase.from('gps_events').insert({
          technician_id: technicianId,
          latitude: loc.Latitude || loc.latitude,
          longitude: loc.Longitude || loc.longitude,
          timestamp: timestamp,
          speed: loc.Speed || loc.speed || null,
          heading: loc.Heading || loc.heading || null,
          address: loc.Address || loc.address || null,
          event_type: 'location_update',
        });

        if (error) {
          console.error(`Error inserting GPS event:`, error);
        }
      }
    }

    return NextResponse.json({
      success: true,
      locations: locationArray,
      count: locationArray.length,
      synced: syncToDb,
    });
  } catch (error: any) {
    console.error('Verizon Locations API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch locations' },
      { status: 500 }
    );
  }
}
