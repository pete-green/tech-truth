import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getVehicleSegments } from '@/lib/verizon-connect';
import { buildDayTimeline } from '@/lib/timeline-builder';
import { JobDetail } from '@/types/reports';
import { TechTimelineConfig, DayTimeline, TimelinePunchRecord, ManualJobAssociation, JobEstimateSummary, EstimateDetail, EstimateItemDetail } from '@/types/timeline';
import { CustomLocationRow, rowToCustomLocation } from '@/types/custom-location';
import { OFFICE_LOCATION } from '@/lib/geo-utils';
import { parseISO, differenceInMinutes, addDays, format } from 'date-fns';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const searchParams = req.nextUrl.searchParams;

  const date = searchParams.get('date');
  const technicianId = searchParams.get('technicianId');

  if (!date || !technicianId) {
    return NextResponse.json(
      { error: 'date and technicianId are required' },
      { status: 400 }
    );
  }

  try {
    // Get technician info including home location and vehicle ID
    const { data: technician, error: techError } = await supabase
      .from('technicians')
      .select(`
        id,
        name,
        takes_truck_home,
        home_latitude,
        home_longitude,
        home_address,
        exclude_from_office_visits,
        verizon_vehicle_id
      `)
      .eq('id', technicianId)
      .single();

    if (techError || !technician) {
      return NextResponse.json(
        { error: 'Technician not found' },
        { status: 404 }
      );
    }

    // Check if technician has GPS tracking
    if (!technician.verizon_vehicle_id) {
      return NextResponse.json(
        { error: 'No GPS vehicle assigned to this technician' },
        { status: 400 }
      );
    }

    // Get jobs for this technician on this date
    const { data: jobs, error: jobsError } = await supabase
      .from('jobs')
      .select(`
        id,
        job_number,
        customer_name,
        job_address,
        scheduled_start,
        actual_arrival,
        is_first_job_of_day,
        is_follow_up,
        job_latitude,
        job_longitude,
        status
      `)
      .eq('technician_id', technicianId)
      .eq('job_date', date)
      .order('scheduled_start', { ascending: true });

    if (jobsError) throw jobsError;

    // Get discrepancies for late arrival info
    const { data: discrepancies, error: discError } = await supabase
      .from('arrival_discrepancies')
      .select('job_id, variance_minutes, is_late')
      .eq('technician_id', technicianId)
      .eq('job_date', date);

    if (discError) throw discError;

    // Create discrepancy map
    const discrepancyMap = new Map<string, { varianceMinutes: number; isLate: boolean }>();
    for (const disc of discrepancies || []) {
      if (disc.job_id) {
        discrepancyMap.set(disc.job_id, {
          varianceMinutes: disc.variance_minutes || 0,
          isLate: disc.is_late || false,
        });
      }
    }

    // Convert jobs to JobDetail format
    const jobDetails: JobDetail[] = (jobs || []).map(job => {
      const disc = discrepancyMap.get(job.id);

      let varianceMinutes: number | null = disc?.varianceMinutes ?? null;
      let isLate = disc?.isLate ?? false;

      if (varianceMinutes === null && job.scheduled_start && job.actual_arrival) {
        const scheduled = parseISO(job.scheduled_start);
        const actual = parseISO(job.actual_arrival);
        varianceMinutes = differenceInMinutes(actual, scheduled);
        isLate = varianceMinutes > 0;
      }

      return {
        id: job.id,
        jobNumber: job.job_number || '',
        customerName: job.customer_name,
        jobAddress: job.job_address,
        scheduledStart: job.scheduled_start,
        actualArrival: job.actual_arrival,
        varianceMinutes,
        isLate,
        isFirstJob: job.is_first_job_of_day || false,
        isFollowUp: job.is_follow_up || false,
        jobLatitude: job.job_latitude,
        jobLongitude: job.job_longitude,
        status: job.status,
      };
    });

    // First try to get GPS segments from stored database (synced data)
    // Fall back to live Verizon API if no stored data
    const targetDate = parseISO(date);
    let segments: Awaited<ReturnType<typeof getVehicleSegments>>['Segments'] = [];
    let usedStoredData = false;

    // Try to get stored segments first
    const { data: storedSegments, error: storedError } = await supabase
      .from('gps_segments')
      .select('*')
      .eq('technician_id', technicianId)
      .eq('segment_date', date)
      .order('start_time', { ascending: true });

    if (!storedError && storedSegments && storedSegments.length > 0) {
      // Convert stored segments back to Verizon API format for timeline builder
      segments = storedSegments.map(seg => ({
        StartDateUtc: seg.start_time?.replace('Z', '').replace('.000', '') || '',
        EndDateUtc: seg.end_time?.replace('Z', '').replace('.000', '') || null,
        IsComplete: seg.is_complete || false,
        StartLocation: {
          Latitude: seg.start_latitude,
          Longitude: seg.start_longitude,
          AddressLine1: seg.start_address?.split(',')[0] || '',
          AddressLine2: '',
          Locality: seg.start_address?.split(',')[1]?.trim() || '',
          AdministrativeArea: seg.start_address?.split(',')[2]?.trim() || '',
          PostalCode: seg.start_address?.split(',')[3]?.trim() || '',
          Country: 'USA',
        },
        StartLocationIsPrivate: false,
        EndLocation: seg.end_latitude && seg.end_longitude ? {
          Latitude: seg.end_latitude,
          Longitude: seg.end_longitude,
          AddressLine1: seg.end_address?.split(',')[0] || '',
          AddressLine2: '',
          Locality: seg.end_address?.split(',')[1]?.trim() || '',
          AdministrativeArea: seg.end_address?.split(',')[2]?.trim() || '',
          PostalCode: seg.end_address?.split(',')[3]?.trim() || '',
          Country: 'USA',
        } : null,
        EndLocationIsPrivate: false,
        DistanceTraveled: seg.distance_miles || 0,
        DistanceKilometers: (seg.distance_miles || 0) * 1.60934,
        MaxSpeed: seg.max_speed || 0,
        IdleTime: seg.idle_minutes ? seg.idle_minutes * 60 : 0,
      }));
      usedStoredData = true;
      console.log(`[Timeline] Using ${segments.length} stored segments for ${technician.name} on ${date}`);
    }

    // Fall back to live API if no stored data
    if (segments.length === 0) {
      console.log(`[Timeline] No stored segments, fetching from Verizon API for ${technician.name} on ${date}`);

      // Query window: 4 AM EST (9 AM UTC) day-of to 5 AM EST (10 AM UTC) next day
      const startDateUtc = `${date}T09:00:00Z`;
      const nextDay = format(addDays(targetDate, 1), 'yyyy-MM-dd');
      const endDateUtc = `${nextDay}T10:00:00Z`;

      try {
        const segmentsResponse = await getVehicleSegments(
          technician.verizon_vehicle_id,
          startDateUtc,
          endDateUtc
        );
        const allSegments = segmentsResponse?.Segments || [];

        // Filter segments to only include this day's work
        const dayStart = new Date(Date.UTC(
          targetDate.getUTCFullYear(),
          targetDate.getUTCMonth(),
          targetDate.getUTCDate(),
          9, 0, 0 // 9 AM UTC = 4 AM EST
        ));

        const nextDayWorkStart = new Date(Date.UTC(
          targetDate.getUTCFullYear(),
          targetDate.getUTCMonth(),
          targetDate.getUTCDate() + 1,
          10, 0, 0 // 10 AM UTC = 5 AM EST
        ));

        segments = allSegments.filter(seg => {
          if (!seg.StartDateUtc) return false;
          const startTime = new Date(seg.StartDateUtc + (seg.StartDateUtc.includes('Z') ? '' : 'Z'));
          return startTime >= dayStart && startTime < nextDayWorkStart;
        });
      } catch (gpsError: any) {
        console.error('Error fetching GPS segments:', gpsError);
        segments = [];
      }
    }

    // Fetch custom locations for matching against GPS stops
    const { data: customLocationRows } = await supabase
      .from('custom_locations')
      .select('*');

    const customLocations = (customLocationRows as CustomLocationRow[] || [])
      .map(rowToCustomLocation);

    // Fetch punch records for this technician on this date
    const { data: punchRecords } = await supabase
      .from('punch_records')
      .select(`
        id,
        punch_time,
        punch_type,
        clock_in_time,
        clock_out_time,
        gps_latitude,
        gps_longitude,
        gps_address,
        gps_location_type,
        is_violation,
        violation_reason,
        expected_location_type,
        can_be_excused,
        origin,
        paylocity_employee_id,
        duration_hours,
        cost_center_name
      `)
      .eq('technician_id', technicianId)
      .eq('punch_date', date)
      .order('punch_time', { ascending: true });

    // DATA INTEGRITY FIX: Auto-create missing ClockOut records
    // If a ClockIn has clock_out_time but there's no corresponding ClockOut record, create it
    const clockInRecords = (punchRecords || []).filter(p => p.punch_type === 'ClockIn' && p.clock_out_time);
    const clockOutRecords = (punchRecords || []).filter(p => p.punch_type === 'ClockOut');

    for (const clockIn of clockInRecords) {
      // Check if there's a corresponding ClockOut
      const hasClockOut = clockOutRecords.some(co =>
        co.clock_out_time === clockIn.clock_out_time ||
        co.punch_time === clockIn.clock_out_time
      );

      if (!hasClockOut && clockIn.clock_out_time) {
        // Create the missing ClockOut record
        const { data: newClockOut, error: createError } = await supabase
          .from('punch_records')
          .insert({
            technician_id: technicianId,
            paylocity_employee_id: clockIn.paylocity_employee_id,
            punch_date: date,
            punch_time: clockIn.clock_out_time,
            punch_type: 'ClockOut',
            gps_location_type: 'no_gps',
            gps_distance_from_punch_feet: 0,
            is_violation: false,
            expected_location_type: clockIn.expected_location_type,
            can_be_excused: false,
            clock_in_time: clockIn.clock_in_time,
            clock_out_time: clockIn.clock_out_time,
            duration_hours: clockIn.duration_hours,
            origin: clockIn.origin,
            cost_center_name: clockIn.cost_center_name,
          })
          .select()
          .single();

        if (!createError && newClockOut) {
          // Add to our local records so the timeline includes it
          (punchRecords as any[]).push(newClockOut);
          console.log(`Auto-created missing ClockOut record for ${technician.name} on ${date}`);
        }
      }
    }

    // Also handle MealStart/MealEnd the same way
    const mealStartRecords = (punchRecords || []).filter(p => p.punch_type === 'MealStart' && p.clock_out_time);
    const mealEndRecords = (punchRecords || []).filter(p => p.punch_type === 'MealEnd');

    for (const mealStart of mealStartRecords) {
      const hasMealEnd = mealEndRecords.some(me =>
        me.clock_out_time === mealStart.clock_out_time ||
        me.punch_time === mealStart.clock_out_time
      );

      if (!hasMealEnd && mealStart.clock_out_time) {
        const { data: newMealEnd, error: createError } = await supabase
          .from('punch_records')
          .insert({
            technician_id: technicianId,
            paylocity_employee_id: mealStart.paylocity_employee_id,
            punch_date: date,
            punch_time: mealStart.clock_out_time,
            punch_type: 'MealEnd',
            gps_location_type: 'no_gps',
            gps_distance_from_punch_feet: 0,
            is_violation: false,
            expected_location_type: mealStart.expected_location_type,
            can_be_excused: false,
            clock_in_time: mealStart.clock_in_time,
            clock_out_time: mealStart.clock_out_time,
            duration_hours: mealStart.duration_hours,
            origin: mealStart.origin,
            cost_center_name: mealStart.cost_center_name,
          })
          .select()
          .single();

        if (!createError && newMealEnd) {
          (punchRecords as any[]).push(newMealEnd);
          console.log(`Auto-created missing MealEnd record for ${technician.name} on ${date}`);
        }
      }
    }

    // Re-sort after potentially adding records
    (punchRecords as any[]).sort((a, b) =>
      new Date(a.punch_time).getTime() - new Date(b.punch_time).getTime()
    );

    // Convert to TimelinePunchRecord format
    const punches: TimelinePunchRecord[] = (punchRecords || []).map(p => ({
      id: p.id,
      punch_time: p.punch_time,
      punch_type: p.punch_type,
      clock_in_time: p.clock_in_time,
      clock_out_time: p.clock_out_time,
      gps_latitude: p.gps_latitude,
      gps_longitude: p.gps_longitude,
      gps_address: p.gps_address,
      gps_location_type: p.gps_location_type,
      is_violation: p.is_violation,
      violation_reason: p.violation_reason,
      expected_location_type: p.expected_location_type,
      can_be_excused: p.can_be_excused,
      origin: p.origin,
    }));

    // Fetch excused office visit for this technician on this date
    const { data: excusedVisit } = await supabase
      .from('excused_office_visits')
      .select('reason, notes')
      .eq('technician_id', technicianId)
      .eq('visit_date', date)
      .single();

    const excusedOfficeVisit = excusedVisit
      ? { reason: excusedVisit.reason, notes: excusedVisit.notes || undefined }
      : undefined;

    // Fetch manual job associations for this technician on this date
    const { data: manualAssocRows } = await supabase
      .from('manual_job_associations')
      .select('*')
      .eq('technician_id', technicianId)
      .eq('job_date', date);

    const manualAssociations: ManualJobAssociation[] = (manualAssocRows || []).map(row => ({
      id: row.id,
      technician_id: row.technician_id,
      job_id: row.job_id,
      job_date: row.job_date,
      gps_latitude: row.gps_latitude,
      gps_longitude: row.gps_longitude,
      gps_timestamp: row.gps_timestamp,
      gps_address: row.gps_address,
      created_at: row.created_at,
      notes: row.notes,
    }));

    // Build tech config
    const techConfig: TechTimelineConfig = {
      takesTruckHome: technician.takes_truck_home || false,
      homeLocation: technician.home_latitude && technician.home_longitude
        ? {
            lat: technician.home_latitude,
            lon: technician.home_longitude,
            address: technician.home_address || 'Home',
          }
        : undefined,
      officeLocation: {
        lat: OFFICE_LOCATION.latitude,
        lon: OFFICE_LOCATION.longitude,
      },
      excludeFromOfficeVisits: technician.exclude_from_office_visits || false,
    };

    // Fetch proposed punches for this technician on this date
    const { data: proposedPunches } = await supabase
      .from('proposed_punches')
      .select('*')
      .eq('technician_id', technicianId)
      .eq('date', date)
      .order('proposed_time', { ascending: true });

    // Build the timeline
    const timeline: DayTimeline = buildDayTimeline({
      date,
      technicianId: technician.id,
      technicianName: technician.name,
      segments,
      jobs: jobDetails,
      techConfig,
      customLocations,
      punches,
      excusedOfficeVisit,
      manualAssociations,
    });

    // Add proposed punches as events in the timeline
    if (proposedPunches && proposedPunches.length > 0) {
      for (const pp of proposedPunches) {
        timeline.events.push({
          id: `proposed-${pp.id}`,
          type: 'proposed_punch',
          timestamp: pp.proposed_time,
          proposedPunchId: pp.id,
          proposedPunchType: pp.punch_type,
          proposedPunchNote: pp.note,
          proposedPunchStatus: pp.status,
        });
      }
      // Re-sort events by timestamp after adding proposed punches
      timeline.events.sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
    }

    // Enrich job events with estimate data
    const jobEvents = timeline.events.filter(e => e.type === 'arrived_job' && e.jobId);
    if (jobEvents.length > 0) {
      const jobIds = jobEvents.map(e => e.jobId!);

      // Fetch all estimates for these jobs with their items
      const { data: estimatesData } = await supabase
        .from('estimates')
        .select(`
          id,
          job_id,
          estimate_number,
          name,
          status,
          is_sold,
          total,
          sold_at,
          minutes_from_arrival_to_creation,
          minutes_from_arrival_to_sale,
          estimate_items (
            id,
            sku_name,
            description,
            quantity,
            unit_price,
            total_price,
            item_type,
            is_sold
          )
        `)
        .in('job_id', jobIds);

      if (estimatesData && estimatesData.length > 0) {
        // Group estimates by job_id
        const estimatesByJob = new Map<string, typeof estimatesData>();
        for (const est of estimatesData) {
          if (!est.job_id) continue;
          const existing = estimatesByJob.get(est.job_id) || [];
          existing.push(est);
          estimatesByJob.set(est.job_id, existing);
        }

        // Attach estimates to each job event
        for (const event of jobEvents) {
          if (!event.jobId) continue;
          const jobEstimates = estimatesByJob.get(event.jobId);

          if (jobEstimates && jobEstimates.length > 0) {
            // Calculate summary
            const soldEstimates = jobEstimates.filter(e => e.is_sold);
            const unsoldEstimates = jobEstimates.filter(e => !e.is_sold);

            const summary: JobEstimateSummary = {
              totalEstimates: jobEstimates.length,
              soldEstimates: soldEstimates.length,
              unsoldEstimates: unsoldEstimates.length,
              totalValue: jobEstimates.reduce((sum, e) => sum + (e.total || 0), 0),
              soldValue: soldEstimates.reduce((sum, e) => sum + (e.total || 0), 0),
              unsoldValue: unsoldEstimates.reduce((sum, e) => sum + (e.total || 0), 0),
              minutesToFirstEstimate: Math.min(
                ...jobEstimates
                  .map(e => e.minutes_from_arrival_to_creation)
                  .filter((m): m is number => m !== null && m >= 0)
              ) || null,
              minutesToFirstSale: soldEstimates.length > 0
                ? Math.min(
                    ...soldEstimates
                      .map(e => e.minutes_from_arrival_to_sale)
                      .filter((m): m is number => m !== null && m >= 0)
                  ) || null
                : null,
            };

            // Handle Infinity from Math.min on empty array
            if (summary.minutesToFirstEstimate === Infinity) summary.minutesToFirstEstimate = null;
            if (summary.minutesToFirstSale === Infinity) summary.minutesToFirstSale = null;

            // Build detailed estimates with items
            const details: EstimateDetail[] = jobEstimates.map(est => ({
              id: est.id,
              estimateNumber: est.estimate_number,
              name: est.name,
              status: est.status || 'Unknown',
              isSold: est.is_sold || false,
              total: est.total,
              soldAt: est.sold_at,
              minutesFromArrival: est.minutes_from_arrival_to_creation,
              items: (est.estimate_items || []).map((item: any) => ({
                id: item.id,
                skuName: item.sku_name,
                description: item.description,
                quantity: item.quantity || 1,
                unitPrice: item.unit_price,
                totalPrice: item.total_price,
                itemType: item.item_type,
                isSold: item.is_sold || false,
              })),
            }));

            event.estimateSummary = summary;
            event.estimates = details;
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      timeline,
    });
  } catch (error: any) {
    console.error('Error fetching technician timeline:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch technician timeline' },
      { status: 500 }
    );
  }
}
