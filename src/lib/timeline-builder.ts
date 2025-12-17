// Timeline builder - constructs chronological daily activity timeline from GPS segments and job data

import { VehicleSegment } from './verizon-connect';
import { JobDetail } from '@/types/reports';
import { TimelineEvent, TimelineInput, TechTimelineConfig, DayTimeline } from '@/types/timeline';
import { CustomLocation } from '@/types/custom-location';
import {
  calculateDistanceFeet,
  isNearOffice,
  ARRIVAL_RADIUS_FEET,
  parseVerizonUtcTimestamp,
  OFFICE_LOCATION,
  HOME_RADIUS_FEET,
  isPointInPolygon,
} from './geo-utils';
import { format, parseISO } from 'date-fns';

/**
 * Match jobs to GPS segments based on location proximity
 * Returns a map of segment index -> job for segments that match a job location
 */
function matchJobsToSegments(
  segments: VehicleSegment[],
  jobs: JobDetail[],
  radiusFeet: number = ARRIVAL_RADIUS_FEET
): Map<number, JobDetail> {
  const matches = new Map<number, JobDetail>();

  // Jobs that have coordinates
  const jobsWithCoords = jobs.filter(job => job.jobLatitude && job.jobLongitude);

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (!segment.EndLocation) continue;

    for (const job of jobsWithCoords) {
      const distance = calculateDistanceFeet(
        segment.EndLocation.Latitude,
        segment.EndLocation.Longitude,
        job.jobLatitude!,
        job.jobLongitude!
      );

      if (distance <= radiusFeet) {
        // Found a match - use the first matching job for this segment
        if (!matches.has(i)) {
          matches.set(i, job);
        }
      }
    }
  }

  return matches;
}

/**
 * Check if a location is near home
 */
function isNearHome(
  lat: number,
  lon: number,
  homeLocation?: { lat: number; lon: number }
): boolean {
  if (!homeLocation) return false;

  return calculateDistanceFeet(lat, lon, homeLocation.lat, homeLocation.lon) <= HOME_RADIUS_FEET;
}

/**
 * Find a matching custom location for a given coordinate
 * Returns the custom location if within its geofence boundary, null otherwise
 * Supports both circle (radius-based) and polygon boundaries
 */
function findMatchingCustomLocation(
  lat: number,
  lon: number,
  customLocations?: CustomLocation[]
): CustomLocation | null {
  if (!customLocations || customLocations.length === 0) return null;

  for (const loc of customLocations) {
    // Check based on boundary type
    if (loc.boundaryType === 'polygon' && loc.boundaryPolygon && loc.boundaryPolygon.length >= 3) {
      // Use polygon detection
      if (isPointInPolygon(lat, lon, loc.boundaryPolygon)) {
        return loc;
      }
    } else {
      // Use circle detection (default)
      const distance = calculateDistanceFeet(lat, lon, loc.centerLatitude, loc.centerLongitude);
      if (distance <= loc.radiusFeet) {
        return loc;
      }
    }
  }
  return null;
}

/**
 * Classify a location as home, office, job site, custom location, or unknown
 */
function classifyLocation(
  lat: number,
  lon: number,
  techConfig: TechTimelineConfig,
  matchedJob?: JobDetail,
  customLocations?: CustomLocation[]
): { type: 'home' | 'office' | 'job' | 'custom' | 'unknown'; customLocation?: CustomLocation } {
  if (matchedJob) return { type: 'job' };

  // Check custom locations BEFORE office (custom locations take priority)
  const customMatch = findMatchingCustomLocation(lat, lon, customLocations);
  if (customMatch) return { type: 'custom', customLocation: customMatch };

  if (isNearOffice(lat, lon)) return { type: 'office' };
  if (techConfig.takesTruckHome && isNearHome(lat, lon, techConfig.homeLocation)) return { type: 'home' };
  return { type: 'unknown' };
}

/**
 * Format address from Verizon segment location
 */
function formatSegmentAddress(location: VehicleSegment['StartLocation']): string {
  if (!location) return '';

  const parts: string[] = [];
  if (location.AddressLine1) parts.push(location.AddressLine1);
  if (location.Locality) parts.push(location.Locality);
  if (location.AdministrativeArea) parts.push(location.AdministrativeArea);

  return parts.join(', ') || 'Unknown location';
}

/**
 * Build a comprehensive daily timeline from GPS segments and job data
 */
export function buildDayTimeline(input: TimelineInput): DayTimeline {
  const { date, technicianId, technicianName, segments, jobs, techConfig, customLocations } = input;

  const events: TimelineEvent[] = [];
  let eventId = 0;

  // Sort segments by start time
  const sortedSegments = [...segments]
    .filter(seg => seg.StartDateUtc && seg.StartLocation)
    .sort((a, b) =>
      parseVerizonUtcTimestamp(a.StartDateUtc!).getTime() - parseVerizonUtcTimestamp(b.StartDateUtc!).getTime()
    );

  if (sortedSegments.length === 0) {
    // No GPS data for this day - but still include punch events
    const punchOnlyEvents: TimelineEvent[] = [];
    let punchEventId = 0;

    if (input.punches && input.punches.length > 0) {
      for (const punch of input.punches) {
        let eventType: TimelineEvent['type'];
        if (punch.punch_type === 'ClockIn' || punch.clock_in_time) {
          eventType = 'clock_in';
        } else if (punch.punch_type === 'ClockOut' || punch.clock_out_time) {
          eventType = 'clock_out';
        } else if (punch.punch_type === 'MealStart') {
          eventType = 'meal_start';
        } else if (punch.punch_type === 'MealEnd') {
          eventType = 'meal_end';
        } else {
          continue;
        }

        const punchTime = eventType === 'clock_in'
          ? (punch.clock_in_time || punch.punch_time)
          : eventType === 'clock_out'
            ? (punch.clock_out_time || punch.punch_time)
            : punch.punch_time;

        if (!punchTime) continue;

        const isExcused = input.excusedOfficeVisit &&
                          punch.gps_location_type === 'office' &&
                          eventType === 'clock_in';

        punchOnlyEvents.push({
          id: `event-${punchEventId++}`,
          type: eventType,
          timestamp: punchTime,
          address: punch.gps_address ?? undefined,
          latitude: punch.gps_latitude ?? undefined,
          longitude: punch.gps_longitude ?? undefined,
          punchId: punch.id,
          origin: punch.origin ?? undefined,
          isViolation: (punch.is_violation && !isExcused) ?? undefined,
          violationReason: punch.is_violation && !isExcused ? (punch.violation_reason ?? undefined) : undefined,
          expectedLocationType: punch.expected_location_type ?? undefined,
          canBeExcused: punch.can_be_excused ?? undefined,
          isExcused: isExcused,
          excusedReason: isExcused ? input.excusedOfficeVisit?.reason : undefined,
          gpsLocationType: punch.gps_location_type ?? undefined,
        });
      }
      punchOnlyEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }

    // Detect missing clock-out for punch-only events
    const hasClockInOnly = punchOnlyEvents.some(e => e.type === 'clock_in');
    const hasClockOutOnly = punchOnlyEvents.some(e => e.type === 'clock_out');
    const hasMissingClockOutOnly = hasClockInOnly && !hasClockOutOnly;

    if (hasMissingClockOutOnly) {
      const lastEvent = punchOnlyEvents[punchOnlyEvents.length - 1];
      const warningTimestamp = lastEvent
        ? new Date(new Date(lastEvent.timestamp).getTime() + 60000).toISOString()
        : `${date}T23:59:00.000Z`;

      punchOnlyEvents.push({
        id: `event-${punchEventId}`,
        type: 'missing_clock_out',
        timestamp: warningTimestamp,
        isViolation: true,
        violationReason: 'Technician clocked in but never clocked out',
      });
    }

    return {
      date,
      dayOfWeek: format(parseISO(date), 'EEEE'),
      technicianId,
      technicianName,
      events: punchOnlyEvents,
      totalJobs: jobs.length,
      totalOfficeVisits: 0,
      totalDriveMinutes: 0,
      firstJobOnTime: null,
      firstJobVariance: null,
      hasMissingClockOut: hasMissingClockOutOnly,
    };
  }

  // Match jobs to segments
  const segmentJobMatches = matchJobsToSegments(sortedSegments, jobs);

  // Track what we've seen
  let totalDriveMinutes = 0;
  let totalOfficeVisits = 0;
  let jobsVisited = new Set<string>();
  let firstJobProcessed = false;
  let firstJobOnTime: boolean | null = null;
  let firstJobVariance: number | null = null;

  // Track the last visible event departure time (for elapsed time calculation)
  let lastVisibleDepartureTime: Date | null = null;

  // Track last arrival to dedupe consecutive arrivals at same location type
  // This prevents multiple "Arrived Home" events when GPS registers multiple short segments
  let lastArrivalType: string | null = null;
  let lastArrivalJobId: string | null = null;

  // Find first job for late detection
  const firstJob = jobs.find(j => j.isFirstJob) || jobs[0];
  const firstJobScheduledTime = firstJob?.scheduledStart ? parseISO(firstJob.scheduledStart) : null;

  // Process first segment specially - where did they START?
  const firstSegment = sortedSegments[0];
  const startLocation = firstSegment.StartLocation!;
  const startClassification = classifyLocation(
    startLocation.Latitude,
    startLocation.Longitude,
    techConfig,
    undefined, // Start location shouldn't match a job
    customLocations
  );

  // Create "left" event for starting location
  const startTime = parseVerizonUtcTimestamp(firstSegment.StartDateUtc!);

  if (startClassification.type === 'home') {
    events.push({
      id: `event-${eventId++}`,
      type: 'left_home',
      timestamp: startTime.toISOString(),
      address: techConfig.homeLocation?.address || formatSegmentAddress(startLocation),
      latitude: startLocation.Latitude,
      longitude: startLocation.Longitude,
    });
    // Mark that we just left home - prevents "Arrived Home" right after "Left Home"
    lastArrivalType = 'left_home';
  } else if (startClassification.type === 'office') {
    events.push({
      id: `event-${eventId++}`,
      type: 'left_office',
      timestamp: startTime.toISOString(),
      address: formatSegmentAddress(startLocation),
      latitude: startLocation.Latitude,
      longitude: startLocation.Longitude,
    });
    // Mark that we just left office
    lastArrivalType = 'left_office';
  } else if (startClassification.type === 'custom' && startClassification.customLocation) {
    events.push({
      id: `event-${eventId++}`,
      type: 'left_custom',
      timestamp: startTime.toISOString(),
      address: startClassification.customLocation.address || formatSegmentAddress(startLocation),
      latitude: startLocation.Latitude,
      longitude: startLocation.Longitude,
      customLocationId: startClassification.customLocation.id,
      customLocationName: startClassification.customLocation.name,
      customLocationLogo: startClassification.customLocation.logoUrl,
      customLocationCategory: startClassification.customLocation.category,
    });
    // Mark that we just left custom location
    lastArrivalType = 'left_custom';
  }

  // Process each segment's END location (arrivals)
  let previousDepartureTime: Date | null = startTime;

  for (let i = 0; i < sortedSegments.length; i++) {
    const segment = sortedSegments[i];

    if (!segment.EndDateUtc || !segment.EndLocation) continue;

    const arrivalTime = parseVerizonUtcTimestamp(segment.EndDateUtc);
    const matchedJob = segmentJobMatches.get(i);

    const endClassification = classifyLocation(
      segment.EndLocation.Latitude,
      segment.EndLocation.Longitude,
      techConfig,
      matchedJob,
      customLocations
    );

    // Calculate travel time from previous departure
    let travelMinutes: number | undefined;
    if (previousDepartureTime) {
      travelMinutes = Math.round((arrivalTime.getTime() - previousDepartureTime.getTime()) / 60000);
      if (travelMinutes > 0) {
        totalDriveMinutes += travelMinutes;
      }
    }

    // Calculate duration at this stop (time until next segment starts)
    let durationMinutes: number | undefined;
    if (i < sortedSegments.length - 1) {
      const nextSegment = sortedSegments[i + 1];
      if (nextSegment.StartDateUtc) {
        const departureTime = parseVerizonUtcTimestamp(nextSegment.StartDateUtc);
        durationMinutes = Math.round((departureTime.getTime() - arrivalTime.getTime()) / 60000);
        previousDepartureTime = departureTime;
      }
    } else {
      previousDepartureTime = null;
    }

    // Create arrival event (skip duplicates - consecutive arrivals at same location type)
    if (endClassification.type === 'home') {
      // Skip if we already have a home arrival OR we just left home (first segment ending at home)
      if (lastArrivalType === 'home' || lastArrivalType === 'left_home') {
        // Update duration on previous event instead of creating duplicate (if we have an arrival)
        const lastHomeEvent = events.findLast(e => e.type === 'arrived_home');
        if (lastHomeEvent && durationMinutes !== undefined) {
          lastHomeEvent.durationMinutes = (lastHomeEvent.durationMinutes || 0) + (travelMinutes || 0) + durationMinutes;
        }
        // Keep lastArrivalType as-is, we're still at home
      } else {
        events.push({
          id: `event-${eventId++}`,
          type: 'arrived_home',
          timestamp: arrivalTime.toISOString(),
          address: techConfig.homeLocation?.address || formatSegmentAddress(segment.EndLocation),
          latitude: segment.EndLocation.Latitude,
          longitude: segment.EndLocation.Longitude,
          travelMinutes,
          durationMinutes,
        });
        lastArrivalType = 'home';
        lastArrivalJobId = null;
      }
    } else if (endClassification.type === 'office') {
      // Skip if we're already at office OR we just left office
      if (lastArrivalType === 'office' || lastArrivalType === 'left_office') {
        const lastOfficeEvent = events.findLast(e => e.type === 'arrived_office');
        if (lastOfficeEvent && durationMinutes !== undefined) {
          lastOfficeEvent.durationMinutes = (lastOfficeEvent.durationMinutes || 0) + (travelMinutes || 0) + durationMinutes;
        }
        // Keep lastArrivalType as-is
      } else {
        totalOfficeVisits++;

        // Check if this is an unnecessary visit (take-home truck stopped at office before first job)
        let isUnnecessary = false;
        if (techConfig.takesTruckHome &&
            techConfig.homeLocation &&
            firstJobScheduledTime &&
            arrivalTime.getTime() < firstJobScheduledTime.getTime() &&
            events.length > 0 &&
            events[0].type === 'left_home') {
          isUnnecessary = true;
        }

        events.push({
          id: `event-${eventId++}`,
          type: 'arrived_office',
          timestamp: arrivalTime.toISOString(),
          address: formatSegmentAddress(segment.EndLocation),
          latitude: segment.EndLocation.Latitude,
          longitude: segment.EndLocation.Longitude,
          travelMinutes,
          durationMinutes,
          isUnnecessary,
        });

        lastArrivalType = 'office';
        lastArrivalJobId = null;

        // Add departure event if we have duration
        if (durationMinutes !== undefined && durationMinutes > 0 && previousDepartureTime) {
          events.push({
            id: `event-${eventId++}`,
            type: 'left_office',
            timestamp: previousDepartureTime.toISOString(),
            address: formatSegmentAddress(segment.EndLocation),
            latitude: segment.EndLocation.Latitude,
            longitude: segment.EndLocation.Longitude,
          });
          // Mark that we just left office - prevents "Arrived at Office" right after "Left Office"
          lastArrivalType = 'left_office';
        }
      }
    } else if (endClassification.type === 'job' && matchedJob) {
      // Skip if we already have an arrival for this same job OR we just left this same job
      const isAtSameJob = (lastArrivalType === 'job' || lastArrivalType === 'left_job') && lastArrivalJobId === matchedJob.id;
      if (isAtSameJob) {
        // Update duration on previous event instead of creating duplicate
        const lastJobEvent = events.findLast(e => e.type === 'arrived_job' && e.jobId === matchedJob.id);
        if (lastJobEvent && durationMinutes !== undefined) {
          lastJobEvent.durationMinutes = (lastJobEvent.durationMinutes || 0) + (travelMinutes || 0) + durationMinutes;
        }
        // Keep tracking this job
      } else {
        // Check if this is first time visiting this job
        const isFirstVisitToJob = !jobsVisited.has(matchedJob.id);
        const isFirstJob = isFirstVisitToJob && (matchedJob.isFirstJob || (!firstJobProcessed && matchedJob.id === firstJob?.id));

        // Check if late - only calculate on first visit
        let isLate = false;
        let varianceMinutes: number | undefined;

        if (isFirstJob && matchedJob.scheduledStart && isFirstVisitToJob) {
          const scheduledTime = parseISO(matchedJob.scheduledStart);
          varianceMinutes = Math.round((arrivalTime.getTime() - scheduledTime.getTime()) / 60000);
          isLate = varianceMinutes > 0;

          if (!firstJobProcessed) {
            firstJobOnTime = !isLate;
            firstJobVariance = varianceMinutes;
            firstJobProcessed = true;
          }
        }

        // Mark job as visited BEFORE pushing event
        jobsVisited.add(matchedJob.id);

        events.push({
          id: `event-${eventId++}`,
          type: 'arrived_job',
          timestamp: arrivalTime.toISOString(),
          address: matchedJob.jobAddress || formatSegmentAddress(segment.EndLocation),
          latitude: segment.EndLocation.Latitude,
          longitude: segment.EndLocation.Longitude,
          jobNumber: matchedJob.jobNumber,
          jobId: matchedJob.id,
          customerName: matchedJob.customerName || undefined,
          scheduledTime: matchedJob.scheduledStart,
          travelMinutes,
          durationMinutes,
          isLate,
          varianceMinutes,
          isFirstJob,
        });

        lastArrivalType = 'job';
        lastArrivalJobId = matchedJob.id;

        // Add departure event if we have duration
        if (durationMinutes !== undefined && durationMinutes > 0 && previousDepartureTime) {
          events.push({
            id: `event-${eventId++}`,
            type: 'left_job',
            timestamp: previousDepartureTime.toISOString(),
            address: matchedJob.jobAddress || formatSegmentAddress(segment.EndLocation),
            latitude: segment.EndLocation.Latitude,
            longitude: segment.EndLocation.Longitude,
            jobNumber: matchedJob.jobNumber,
            jobId: matchedJob.id,
            customerName: matchedJob.customerName || undefined,
          });
          // Mark that we just left this job - prevents immediate re-arrival at same job
          lastArrivalType = 'left_job';
          lastArrivalJobId = matchedJob.id;
        }
      }
    } else if (endClassification.type === 'custom' && endClassification.customLocation) {
      // Custom labeled location (supply house, gas station, etc.)
      const customLoc = endClassification.customLocation;

      events.push({
        id: `event-${eventId++}`,
        type: 'arrived_custom',
        timestamp: arrivalTime.toISOString(),
        address: customLoc.address || formatSegmentAddress(segment.EndLocation),
        latitude: segment.EndLocation.Latitude,
        longitude: segment.EndLocation.Longitude,
        travelMinutes,
        durationMinutes,
        customLocationId: customLoc.id,
        customLocationName: customLoc.name,
        customLocationLogo: customLoc.logoUrl,
        customLocationCategory: customLoc.category,
      });

      // Add departure event if we have duration
      if (durationMinutes !== undefined && durationMinutes > 0 && previousDepartureTime) {
        events.push({
          id: `event-${eventId++}`,
          type: 'left_custom',
          timestamp: previousDepartureTime.toISOString(),
          address: customLoc.address || formatSegmentAddress(segment.EndLocation),
          latitude: segment.EndLocation.Latitude,
          longitude: segment.EndLocation.Longitude,
          customLocationId: customLoc.id,
          customLocationName: customLoc.name,
          customLocationLogo: customLoc.logoUrl,
          customLocationCategory: customLoc.category,
        });
      }
    } else if (endClassification.type === 'unknown') {
      // Show unknown stops - these could be lunch, supply house, personal errands, etc.
      // Only show if they stayed for more than 2 minutes (filter out traffic lights, etc.)
      if (durationMinutes !== undefined && durationMinutes >= 2) {
        events.push({
          id: `event-${eventId++}`,
          type: 'arrived_unknown',
          timestamp: arrivalTime.toISOString(),
          address: formatSegmentAddress(segment.EndLocation),
          latitude: segment.EndLocation.Latitude,
          longitude: segment.EndLocation.Longitude,
          travelMinutes,
          durationMinutes,
        });

        // Add departure event
        if (previousDepartureTime) {
          events.push({
            id: `event-${eventId++}`,
            type: 'left_unknown',
            timestamp: previousDepartureTime.toISOString(),
            address: formatSegmentAddress(segment.EndLocation),
            latitude: segment.EndLocation.Latitude,
            longitude: segment.EndLocation.Longitude,
          });
        }
      }
    }
  }

  // Add punch events (clock in/out, meal breaks)
  if (input.punches && input.punches.length > 0) {
    for (const punch of input.punches) {
      // Determine event type
      let eventType: TimelineEvent['type'];
      if (punch.punch_type === 'ClockIn' || punch.clock_in_time) {
        eventType = 'clock_in';
      } else if (punch.punch_type === 'ClockOut' || punch.clock_out_time) {
        eventType = 'clock_out';
      } else if (punch.punch_type === 'MealStart') {
        eventType = 'meal_start';
      } else if (punch.punch_type === 'MealEnd') {
        eventType = 'meal_end';
      } else {
        continue; // Unknown punch type
      }

      // Use the appropriate time
      const punchTime = eventType === 'clock_in'
        ? (punch.clock_in_time || punch.punch_time)
        : eventType === 'clock_out'
          ? (punch.clock_out_time || punch.punch_time)
          : punch.punch_time;

      if (!punchTime) continue;

      // Check if excused (for office visits)
      const isExcused = input.excusedOfficeVisit &&
                        punch.gps_location_type === 'office' &&
                        eventType === 'clock_in';

      events.push({
        id: `event-${eventId++}`,
        type: eventType,
        timestamp: punchTime,
        address: punch.gps_address ?? undefined,
        latitude: punch.gps_latitude ?? undefined,
        longitude: punch.gps_longitude ?? undefined,
        punchId: punch.id,
        origin: punch.origin ?? undefined,
        isViolation: (punch.is_violation && !isExcused) ?? undefined,
        violationReason: punch.is_violation && !isExcused ? (punch.violation_reason ?? undefined) : undefined,
        expectedLocationType: punch.expected_location_type ?? undefined,
        canBeExcused: punch.can_be_excused ?? undefined,
        isExcused: isExcused,
        excusedReason: isExcused ? input.excusedOfficeVisit?.reason : undefined,
        gpsLocationType: punch.gps_location_type ?? undefined,
      });
    }

    // Re-sort events by timestamp after adding punch events
    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  // Detect missing clock-out: has clock_in but no clock_out
  const hasClockIn = events.some(e => e.type === 'clock_in');
  const hasClockOut = events.some(e => e.type === 'clock_out');
  const hasMissingClockOut = hasClockIn && !hasClockOut;

  // Add missing_clock_out warning event at end of timeline if applicable
  if (hasMissingClockOut) {
    // Find the last event's timestamp to place the warning after it
    const lastEvent = events[events.length - 1];
    const warningTimestamp = lastEvent
      ? new Date(new Date(lastEvent.timestamp).getTime() + 60000).toISOString() // 1 minute after last event
      : `${date}T23:59:00.000Z`;

    events.push({
      id: `event-${eventId++}`,
      type: 'missing_clock_out',
      timestamp: warningTimestamp,
      isViolation: true,
      violationReason: 'Technician clocked in but never clocked out',
    });
  }

  return {
    date,
    dayOfWeek: format(parseISO(date), 'EEEE'),
    technicianId,
    technicianName,
    events,
    totalJobs: jobs.length,
    totalOfficeVisits,
    totalDriveMinutes,
    firstJobOnTime,
    firstJobVariance,
    hasMissingClockOut,
  };
}
