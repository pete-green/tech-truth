import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { parseISO, subMinutes, addMinutes, format } from 'date-fns';
import { calculateDistanceFeet, parseVerizonUtcTimestamp } from '@/lib/geo-utils';
import { getVehicleGPSData, getVehicleSegments, GPSHistoryPoint } from '@/lib/verizon-connect';

export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const searchParams = req.nextUrl.searchParams;

  const technicianId = searchParams.get('technicianId');
  const jobId = searchParams.get('jobId');
  const scheduledTime = searchParams.get('scheduledTime');

  if (!technicianId || !jobId || !scheduledTime) {
    return NextResponse.json(
      { error: 'technicianId, jobId, and scheduledTime are required' },
      { status: 400 }
    );
  }

  try {
    // Get job info including location
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id, job_latitude, job_longitude, job_address')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    if (!job.job_latitude || !job.job_longitude) {
      return NextResponse.json({
        success: true,
        jobLocation: null,
        truckLocation: null,
        error: 'Job location coordinates not available',
      });
    }

    // Parse scheduled time and create a window around it
    const scheduledDate = parseISO(scheduledTime);
    const windowStart = subMinutes(scheduledDate, 15);
    const windowEnd = addMinutes(scheduledDate, 15);

    // First, try to get GPS events from the database
    const { data: gpsEvents, error: gpsError } = await supabase
      .from('gps_events')
      .select('latitude, longitude, timestamp, address')
      .eq('technician_id', technicianId)
      .gte('timestamp', windowStart.toISOString())
      .lte('timestamp', windowEnd.toISOString())
      .order('timestamp', { ascending: true });

    if (gpsError) throw gpsError;

    let truckLocation = null;

    if (gpsEvents && gpsEvents.length > 0) {
      // Find the GPS point closest to the scheduled time
      let closestEvent = gpsEvents[0];
      let closestDiff = Math.abs(parseISO(closestEvent.timestamp).getTime() - scheduledDate.getTime());

      for (const event of gpsEvents) {
        const diff = Math.abs(parseISO(event.timestamp).getTime() - scheduledDate.getTime());
        if (diff < closestDiff) {
          closestDiff = diff;
          closestEvent = event;
        }
      }

      const distance = calculateDistanceFeet(
        closestEvent.latitude,
        closestEvent.longitude,
        job.job_latitude,
        job.job_longitude
      );

      truckLocation = {
        latitude: closestEvent.latitude,
        longitude: closestEvent.longitude,
        address: closestEvent.address,
        timestamp: closestEvent.timestamp,
        distanceFromJobFeet: Math.round(distance),
      };
    } else {
      // No DB data - fetch directly from Verizon API
      // Get technician's Verizon vehicle ID
      const { data: technician, error: techError } = await supabase
        .from('technicians')
        .select('verizon_vehicle_id')
        .eq('id', technicianId)
        .single();

      if (techError || !technician?.verizon_vehicle_id) {
        // No vehicle assigned, can't fetch GPS
        return NextResponse.json({
          success: true,
          jobLocation: {
            latitude: job.job_latitude,
            longitude: job.job_longitude,
            address: job.job_address,
          },
          truckLocation: null,
        });
      }

      try {
        // Fetch GPS data from Verizon for a wider window around scheduled time
        const fetchStart = subMinutes(scheduledDate, 30);
        const fetchEnd = addMinutes(scheduledDate, 30);

        // Check if this is same-day data
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const scheduledDay = new Date(scheduledDate);
        scheduledDay.setHours(0, 0, 0, 0);
        const isSameDay = scheduledDay.getTime() === today.getTime();

        let gpsPoints: GPSHistoryPoint[] = [];

        if (isSameDay) {
          // Use segments endpoint for same-day data
          const todayStr = format(today, 'yyyy-MM-dd') + 'T00:00:00Z';
          const segmentsData = await getVehicleSegments(technician.verizon_vehicle_id, todayStr);
          const segments = segmentsData.Segments || [];

          // Convert segment locations to GPS-like points
          for (const seg of segments) {
            // Add start location
            if (seg.StartLocation && seg.StartDateUtc) {
              gpsPoints.push({
                VehicleNumber: '',
                VehicleName: '',
                UpdateUtc: seg.StartDateUtc,
                OdometerInKM: 0,
                IsPrivate: seg.StartLocationIsPrivate,
                DriverNumber: null,
                FirstName: null,
                LastName: null,
                Address: {
                  AddressLine1: seg.StartLocation.AddressLine1,
                  AddressLine2: seg.StartLocation.AddressLine2,
                  Locality: seg.StartLocation.Locality,
                  AdministrativeArea: seg.StartLocation.AdministrativeArea,
                  PostalCode: seg.StartLocation.PostalCode,
                  Country: seg.StartLocation.Country,
                },
                Latitude: seg.StartLocation.Latitude,
                Longitude: seg.StartLocation.Longitude,
                Speed: 0,
                BatteryLevel: null,
              });
            }
            // Add end location
            if (seg.EndLocation && seg.EndDateUtc) {
              gpsPoints.push({
                VehicleNumber: '',
                VehicleName: '',
                UpdateUtc: seg.EndDateUtc,
                OdometerInKM: 0,
                IsPrivate: seg.EndLocationIsPrivate || false,
                DriverNumber: null,
                FirstName: null,
                LastName: null,
                Address: {
                  AddressLine1: seg.EndLocation.AddressLine1,
                  AddressLine2: seg.EndLocation.AddressLine2,
                  Locality: seg.EndLocation.Locality,
                  AdministrativeArea: seg.EndLocation.AdministrativeArea,
                  PostalCode: seg.EndLocation.PostalCode,
                  Country: seg.EndLocation.Country,
                },
                Latitude: seg.EndLocation.Latitude,
                Longitude: seg.EndLocation.Longitude,
                Speed: 0,
                BatteryLevel: null,
              });
            }
          }
        } else {
          // Use GPS history endpoint for past days
          gpsPoints = await getVehicleGPSData(
            technician.verizon_vehicle_id,
            fetchStart.toISOString(),
            fetchEnd.toISOString()
          );
        }

        if (gpsPoints.length > 0) {
          // Find the GPS point closest to the scheduled time
          let closestPoint = gpsPoints[0];
          let closestDiff = Math.abs(
            parseVerizonUtcTimestamp(closestPoint.UpdateUtc).getTime() - scheduledDate.getTime()
          );

          for (const point of gpsPoints) {
            const pointTime = parseVerizonUtcTimestamp(point.UpdateUtc);
            const diff = Math.abs(pointTime.getTime() - scheduledDate.getTime());
            if (diff < closestDiff) {
              closestDiff = diff;
              closestPoint = point;
            }
          }

          const distance = calculateDistanceFeet(
            closestPoint.Latitude,
            closestPoint.Longitude,
            job.job_latitude,
            job.job_longitude
          );

          const pointTime = parseVerizonUtcTimestamp(closestPoint.UpdateUtc);
          const addressStr = closestPoint.Address
            ? `${closestPoint.Address.AddressLine1}, ${closestPoint.Address.Locality}, ${closestPoint.Address.AdministrativeArea}`
            : null;

          truckLocation = {
            latitude: closestPoint.Latitude,
            longitude: closestPoint.Longitude,
            address: addressStr,
            timestamp: pointTime.toISOString(),
            distanceFromJobFeet: Math.round(distance),
          };
        }
      } catch (verizonError: any) {
        console.error('Verizon API error:', verizonError.message);
        // Continue without truck location
      }
    }

    return NextResponse.json({
      success: true,
      jobLocation: {
        latitude: job.job_latitude,
        longitude: job.job_longitude,
        address: job.job_address,
      },
      truckLocation,
    });
  } catch (error: any) {
    console.error('Error fetching GPS location:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch GPS location' },
      { status: 500 }
    );
  }
}
