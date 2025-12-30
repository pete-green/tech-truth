// Timeline builder - constructs chronological daily activity timeline from GPS segments and job data

import { VehicleSegment } from './verizon-connect';
import { JobDetail } from '@/types/reports';
import { TimelineEvent, TimelineInput, TechTimelineConfig, DayTimeline, ManualJobAssociation } from '@/types/timeline';
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

// Tolerance for matching manual associations to segments
const MANUAL_ASSOC_TIME_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes
const MANUAL_ASSOC_DISTANCE_TOLERANCE_FT = 200; // 200 feet

/**
 * Match manual job associations to GPS segments
 * Returns a map of segment index -> { job, associationId } for manually associated segments
 */
function matchManualAssociationsToSegments(
  segments: VehicleSegment[],
  jobs: JobDetail[],
  manualAssociations?: ManualJobAssociation[]
): Map<number, { job: JobDetail; associationId: string }> {
  const matches = new Map<number, { job: JobDetail; associationId: string }>();

  if (!manualAssociations || manualAssociations.length === 0) {
    return matches;
  }

  // Create a job lookup by ID
  const jobsById = new Map(jobs.map(job => [job.id, job]));

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (!segment.EndLocation || !segment.EndDateUtc) continue;

    const segmentEndTime = parseVerizonUtcTimestamp(segment.EndDateUtc);

    for (const assoc of manualAssociations) {
      const assocTime = new Date(assoc.gps_timestamp);
      const timeDiff = Math.abs(segmentEndTime.getTime() - assocTime.getTime());

      // Check if within time tolerance
      if (timeDiff > MANUAL_ASSOC_TIME_TOLERANCE_MS) continue;

      // Check if within distance tolerance
      const distance = calculateDistanceFeet(
        segment.EndLocation.Latitude,
        segment.EndLocation.Longitude,
        assoc.gps_latitude,
        assoc.gps_longitude
      );

      if (distance <= MANUAL_ASSOC_DISTANCE_TOLERANCE_FT) {
        // Found a match - get the associated job (skip if job_id is null)
        if (assoc.job_id) {
          const job = jobsById.get(assoc.job_id);
          if (job && !matches.has(i)) {
            matches.set(i, { job, associationId: assoc.id });
          }
        }
      }
    }
  }

  return matches;
}

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
        // Check MealStart/MealEnd FIRST since they also have clock_in_time/clock_out_time set
        if (punch.punch_type === 'MealStart') {
          eventType = 'meal_start';
        } else if (punch.punch_type === 'MealEnd') {
          eventType = 'meal_end';
        } else if (punch.punch_type === 'ClockIn' || punch.clock_in_time) {
          eventType = 'clock_in';
        } else if (punch.punch_type === 'ClockOut' || punch.clock_out_time) {
          eventType = 'clock_out';
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
      overnightAtOffice: false, // No GPS data to determine this
      totalMaterialCheckouts: 0, // Will be set by API route after fetching
    };
  }

  // Match manual associations to segments FIRST (takes priority)
  const manualMatches = matchManualAssociationsToSegments(sortedSegments, jobs, input.manualAssociations);

  // Then match remaining jobs to segments automatically
  const segmentJobMatches = matchJobsToSegments(sortedSegments, jobs);

  // Track what we've seen
  let totalDriveMinutes = 0;
  let totalOfficeVisits = 0;
  let jobsVisited = new Set<string>();
  let firstJobProcessed = false;
  let firstJobOnTime: boolean | null = null;
  let firstJobVariance: number | null = null;

  // Track times for elapsed time and gap detection
  // previousArrivalTime: when the PREVIOUS segment ENDED (for calculating elapsed time to user)
  // This is what the user sees as the "from" time
  let previousArrivalTime: Date | null = null;

  // Track last arrival to dedupe consecutive arrivals at same location type
  // This prevents multiple "Arrived Home" events when GPS registers multiple short segments
  let lastArrivalType: string | null = null;
  let lastArrivalJobId: string | null = null;
  let lastArrivalCustomId: string | null = null;

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

  // Detect overnight parking at office for take-home truck techs
  // If tech normally takes truck home but first segment starts at office, flag it
  let overnightAtOffice = false;
  if (techConfig.takesTruckHome && techConfig.homeLocation) {
    const startsAtOffice = startClassification.type === 'office';
    const startsAtHome = startClassification.type === 'home';

    if (startsAtOffice && !startsAtHome) {
      overnightAtOffice = true;
      // Add info event at the start of timeline
      events.push({
        id: `event-${eventId++}`,
        type: 'overnight_at_office',
        timestamp: startTime.toISOString(),
        address: formatSegmentAddress(startLocation),
        latitude: startLocation.Latitude,
        longitude: startLocation.Longitude,
      });
    }
  }

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
    const segmentStartTime = segment.StartDateUtc ? parseVerizonUtcTimestamp(segment.StartDateUtc) : null;

    // Check manual associations first (they take priority over automatic matching)
    const manualMatch = manualMatches.get(i);
    const matchedJob = manualMatch?.job || segmentJobMatches.get(i);
    const isManualAssociation = !!manualMatch;
    const manualAssociationId = manualMatch?.associationId;

    const endClassification = classifyLocation(
      segment.EndLocation.Latitude,
      segment.EndLocation.Longitude,
      techConfig,
      matchedJob,
      customLocations
    );

    // Calculate travel time (actual GPS segment driving time)
    // This is the time the vehicle was actually moving (segment start to segment end)
    let travelMinutes: number | undefined;
    if (segmentStartTime) {
      travelMinutes = Math.round((arrivalTime.getTime() - segmentStartTime.getTime()) / 60000);
      if (travelMinutes > 0) {
        totalDriveMinutes += travelMinutes;
      }
    }

    // Calculate elapsed time since previous arrival (what user actually sees as time between events)
    // This is the REAL time that passed between leaving previous location and arriving here
    let elapsedMinutes: number | undefined;
    let hasUntrackedTime = false;

    if (previousArrivalTime) {
      elapsedMinutes = Math.round((arrivalTime.getTime() - previousArrivalTime.getTime()) / 60000);

      // Check for untracked time: if there's a gap between previous arrival and current segment start
      // (more than 5 minutes unaccounted for = likely GPS gap or parked time not captured)
      if (segmentStartTime) {
        const gapMinutes = Math.round((segmentStartTime.getTime() - previousArrivalTime.getTime()) / 60000);
        // If gap is more than 5 minutes and significantly different from what's shown, flag it
        if (gapMinutes > 5 && elapsedMinutes > (travelMinutes || 0) + 10) {
          hasUntrackedTime = true;
        }
      }
    } else if (previousDepartureTime) {
      // First segment after initial departure - use departure time
      elapsedMinutes = Math.round((arrivalTime.getTime() - previousDepartureTime.getTime()) / 60000);

      // Also check for untracked time on first segment
      // If the travel time is significantly less than elapsed, flag it
      if (segmentStartTime && travelMinutes !== undefined) {
        if (elapsedMinutes > travelMinutes + 10) {
          hasUntrackedTime = true;
        }
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
        // CRITICAL: Still update previousArrivalTime so next elapsed calculation is correct
        previousArrivalTime = arrivalTime;
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
          elapsedMinutes,
          hasUntrackedTime,
          durationMinutes,
        });
        lastArrivalType = 'home';
        lastArrivalJobId = null;
        lastArrivalCustomId = null;
        previousArrivalTime = arrivalTime;
      }
    } else if (endClassification.type === 'office') {
      // Skip if we're already at office OR we just left office
      if (lastArrivalType === 'office' || lastArrivalType === 'left_office') {
        const lastOfficeEvent = events.findLast(e => e.type === 'arrived_office');
        if (lastOfficeEvent && durationMinutes !== undefined) {
          lastOfficeEvent.durationMinutes = (lastOfficeEvent.durationMinutes || 0) + (travelMinutes || 0) + durationMinutes;
        }
        // CRITICAL: Still update previousArrivalTime so next elapsed calculation is correct
        previousArrivalTime = arrivalTime;
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
          elapsedMinutes,
          hasUntrackedTime,
          durationMinutes,
          isUnnecessary,
        });

        lastArrivalType = 'office';
        lastArrivalJobId = null;
        lastArrivalCustomId = null;
        previousArrivalTime = arrivalTime;

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
        // CRITICAL: Still update previousArrivalTime so next elapsed calculation is correct
        previousArrivalTime = arrivalTime;
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
          elapsedMinutes,
          hasUntrackedTime,
          durationMinutes,
          isLate,
          varianceMinutes,
          isFirstJob,
          isFollowUp: matchedJob.isFollowUp,
          isManualAssociation,
          manualAssociationId,
        });

        lastArrivalType = 'job';
        lastArrivalJobId = matchedJob.id;
        lastArrivalCustomId = null;
        previousArrivalTime = arrivalTime;

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

      // Skip if we already have an arrival for this same custom location OR we just left it
      const isAtSameCustom = (lastArrivalType === 'custom' || lastArrivalType === 'left_custom') && lastArrivalCustomId === customLoc.id;
      if (isAtSameCustom) {
        // Update duration on previous event instead of creating duplicate
        const lastCustomEvent = events.findLast(e => e.type === 'arrived_custom' && e.customLocationId === customLoc.id);
        if (lastCustomEvent && durationMinutes !== undefined) {
          lastCustomEvent.durationMinutes = (lastCustomEvent.durationMinutes || 0) + (travelMinutes || 0) + durationMinutes;
        }
        // CRITICAL: Still update previousArrivalTime so next elapsed calculation is correct
        previousArrivalTime = arrivalTime;
        // Keep tracking this custom location
      } else {
        events.push({
          id: `event-${eventId++}`,
          type: 'arrived_custom',
          timestamp: arrivalTime.toISOString(),
          address: customLoc.address || formatSegmentAddress(segment.EndLocation),
          latitude: segment.EndLocation.Latitude,
          longitude: segment.EndLocation.Longitude,
          travelMinutes,
          elapsedMinutes,
          hasUntrackedTime,
          durationMinutes,
          customLocationId: customLoc.id,
          customLocationName: customLoc.name,
          customLocationLogo: customLoc.logoUrl,
          customLocationCategory: customLoc.category,
        });

        lastArrivalType = 'custom';
        lastArrivalCustomId = customLoc.id;
        lastArrivalJobId = null;
        previousArrivalTime = arrivalTime;

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
          // Mark that we just left this custom location
          lastArrivalType = 'left_custom';
          lastArrivalCustomId = customLoc.id;
        }
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
          elapsedMinutes,
          hasUntrackedTime,
          durationMinutes,
        });

        previousArrivalTime = arrivalTime;

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
  // Filter out duplicate punches at the same timestamp to avoid confusion
  // e.g., when a segment ends at 12:34 and another starts at 12:34, we get both ClockOut and ClockIn at same time
  if (input.punches && input.punches.length > 0) {
    // Sort all punches by time
    const sortedPunches = [...input.punches]
      .filter(p => p.punch_time)
      .sort((a, b) => new Date(a.punch_time!).getTime() - new Date(b.punch_time!).getTime());

    // Find unique timestamps with punch types at each
    // If both ClockIn and ClockOut at same time, keep only:
    // - ClockOut if it's the first occurrence at that time (end of segment)
    // - ClockIn if it's the last occurrence at that time (start of next segment)
    // Actually simpler: dedupe by keeping only one punch per unique timestamp
    // Prefer: ClockOut for ending work, ClockIn for starting work
    const seenTimestamps = new Map<string, typeof sortedPunches[0]>();

    for (const punch of sortedPunches) {
      const timeKey = punch.punch_time!;
      const existing = seenTimestamps.get(timeKey);

      if (!existing) {
        seenTimestamps.set(timeKey, punch);
      } else {
        // When multiple punch types occur at the same timestamp, prioritize:
        // 1. MealStart/MealEnd (most informative - shows meal break)
        // 2. ClockOut at end of day, ClockIn at start of day
        // 3. ClockOut mid-day (shows break)
        const isMealPunch = punch.punch_type === 'MealStart' || punch.punch_type === 'MealEnd';
        const existingIsMeal = existing.punch_type === 'MealStart' || existing.punch_type === 'MealEnd';

        if (isMealPunch && !existingIsMeal) {
          // Always prefer meal events over clock events (more informative)
          seenTimestamps.set(timeKey, punch);
        } else if (!isMealPunch && !existingIsMeal) {
          // Both are clock events - use original logic
          const isFirstPunch = sortedPunches.indexOf(punch) <= 1;
          const isLastPunch = sortedPunches.indexOf(punch) >= sortedPunches.length - 2;

          if (isFirstPunch && punch.punch_type === 'ClockIn') {
            seenTimestamps.set(timeKey, punch); // Prefer ClockIn at start of day
          } else if (isLastPunch && punch.punch_type === 'ClockOut') {
            seenTimestamps.set(timeKey, punch); // Prefer ClockOut at end of day
          } else if (existing.punch_type === 'ClockIn' && punch.punch_type === 'ClockOut') {
            seenTimestamps.set(timeKey, punch); // Prefer ClockOut mid-day (going on break)
          }
        }
        // Otherwise keep existing (meal events stay, or first clock event)
      }
    }

    const punchesToShow = Array.from(seenTimestamps.values());

    for (const punch of punchesToShow) {
      // Determine event type based on punch_type field
      // Check MealStart/MealEnd first for consistency
      let eventType: TimelineEvent['type'];
      if (punch.punch_type === 'MealStart') {
        eventType = 'meal_start';
      } else if (punch.punch_type === 'MealEnd') {
        eventType = 'meal_end';
      } else if (punch.punch_type === 'ClockIn') {
        eventType = 'clock_in';
      } else if (punch.punch_type === 'ClockOut') {
        eventType = 'clock_out';
      } else {
        continue; // Unknown punch type
      }

      const punchTime = punch.punch_time;
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
    overnightAtOffice,
    totalMaterialCheckouts: 0, // Will be set by API route after fetching
  };
}
