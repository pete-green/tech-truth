// Timeline builder - constructs chronological daily activity timeline from GPS segments and job data

import { VehicleSegment } from './verizon-connect';
import { JobDetail } from '@/types/reports';
import { TimelineEvent, TimelineInput, TechTimelineConfig, DayTimeline } from '@/types/timeline';
import {
  calculateDistanceFeet,
  isNearOffice,
  ARRIVAL_RADIUS_FEET,
  parseVerizonUtcTimestamp,
  OFFICE_LOCATION,
  HOME_RADIUS_FEET,
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
 * Classify a location as home, office, or job site
 */
function classifyLocation(
  lat: number,
  lon: number,
  techConfig: TechTimelineConfig,
  matchedJob?: JobDetail
): 'home' | 'office' | 'job' | 'unknown' {
  if (matchedJob) return 'job';
  if (isNearOffice(lat, lon)) return 'office';
  if (techConfig.takesTruckHome && isNearHome(lat, lon, techConfig.homeLocation)) return 'home';
  return 'unknown';
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
  const { date, technicianId, technicianName, segments, jobs, techConfig } = input;

  const events: TimelineEvent[] = [];
  let eventId = 0;

  // Sort segments by start time
  const sortedSegments = [...segments]
    .filter(seg => seg.StartDateUtc && seg.StartLocation)
    .sort((a, b) =>
      parseVerizonUtcTimestamp(a.StartDateUtc!).getTime() - parseVerizonUtcTimestamp(b.StartDateUtc!).getTime()
    );

  if (sortedSegments.length === 0) {
    // No GPS data for this day
    return {
      date,
      dayOfWeek: format(parseISO(date), 'EEEE'),
      technicianId,
      technicianName,
      events: [],
      totalJobs: jobs.length,
      totalOfficeVisits: 0,
      totalDriveMinutes: 0,
      firstJobOnTime: null,
      firstJobVariance: null,
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

  // Find first job for late detection
  const firstJob = jobs.find(j => j.isFirstJob) || jobs[0];
  const firstJobScheduledTime = firstJob?.scheduledStart ? parseISO(firstJob.scheduledStart) : null;

  // Process first segment specially - where did they START?
  const firstSegment = sortedSegments[0];
  const startLocation = firstSegment.StartLocation!;
  const startLocationType = classifyLocation(
    startLocation.Latitude,
    startLocation.Longitude,
    techConfig,
    undefined // Start location shouldn't match a job
  );

  // Create "left" event for starting location
  const startTime = parseVerizonUtcTimestamp(firstSegment.StartDateUtc!);

  if (startLocationType === 'home') {
    events.push({
      id: `event-${eventId++}`,
      type: 'left_home',
      timestamp: startTime.toISOString(),
      address: techConfig.homeLocation?.address || formatSegmentAddress(startLocation),
      latitude: startLocation.Latitude,
      longitude: startLocation.Longitude,
    });
  } else if (startLocationType === 'office') {
    events.push({
      id: `event-${eventId++}`,
      type: 'left_office',
      timestamp: startTime.toISOString(),
      address: formatSegmentAddress(startLocation),
      latitude: startLocation.Latitude,
      longitude: startLocation.Longitude,
    });
  }

  // Process each segment's END location (arrivals)
  let previousDepartureTime: Date | null = startTime;

  for (let i = 0; i < sortedSegments.length; i++) {
    const segment = sortedSegments[i];

    if (!segment.EndDateUtc || !segment.EndLocation) continue;

    const arrivalTime = parseVerizonUtcTimestamp(segment.EndDateUtc);
    const matchedJob = segmentJobMatches.get(i);

    const endLocationType = classifyLocation(
      segment.EndLocation.Latitude,
      segment.EndLocation.Longitude,
      techConfig,
      matchedJob
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

    // Create arrival event
    if (endLocationType === 'home') {
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
    } else if (endLocationType === 'office') {
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
      }
    } else if (endLocationType === 'job' && matchedJob) {
      const isFirstJob = matchedJob.isFirstJob || (!firstJobProcessed && matchedJob.id === firstJob?.id);

      // Check if late
      let isLate = false;
      let varianceMinutes: number | undefined;

      if (isFirstJob && matchedJob.scheduledStart) {
        const scheduledTime = parseISO(matchedJob.scheduledStart);
        varianceMinutes = Math.round((arrivalTime.getTime() - scheduledTime.getTime()) / 60000);
        isLate = varianceMinutes > 0;

        if (!firstJobProcessed) {
          firstJobOnTime = !isLate;
          firstJobVariance = varianceMinutes;
          firstJobProcessed = true;
        }
      }

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
      }
    } else if (endLocationType === 'unknown') {
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
  };
}
