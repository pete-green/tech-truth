// Geo utilities for calculating distances between GPS coordinates
import type { VehicleSegment } from './verizon-connect';

/**
 * Calculate the distance between two points using the Haversine formula
 * @returns Distance in feet
 */
export function calculateDistanceFeet(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 20902231; // Earth's radius in feet
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculate the distance between two points
 * @returns Distance in meters
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  return calculateDistanceFeet(lat1, lon1, lat2, lon2) * 0.3048;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Check if a point is within a radius of another point
 */
export function isWithinRadius(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  radiusFeet: number
): boolean {
  return calculateDistanceFeet(lat1, lon1, lat2, lon2) <= radiusFeet;
}

/**
 * Default radius for determining "arrival" at a job site (300 feet)
 * This accounts for:
 * - GPS accuracy (~30 feet typical)
 * - Parking in front of house vs at door
 * - Large properties
 */
export const ARRIVAL_RADIUS_FEET = 300;

/**
 * Find the first GPS point that is within the arrival radius of a target location
 * @returns The GPS point and its index, or null if no arrival found
 */
export function findArrivalPoint<T extends { Latitude: number; Longitude: number; UpdateUtc: string }>(
  gpsPoints: T[],
  targetLat: number,
  targetLon: number,
  radiusFeet: number = ARRIVAL_RADIUS_FEET
): { point: T; index: number } | null {
  for (let i = 0; i < gpsPoints.length; i++) {
    const point = gpsPoints[i];
    if (isWithinRadius(point.Latitude, point.Longitude, targetLat, targetLon, radiusFeet)) {
      return { point, index: i };
    }
  }
  return null;
}

/**
 * Parse Verizon UTC timestamp (they return ISO format without Z suffix)
 * e.g., "2025-12-10T13:09:55" should be interpreted as UTC
 */
function parseVerizonUtcTime(timestamp: string): Date {
  // If it already ends with Z or has timezone info, parse as-is
  if (timestamp.endsWith('Z') || timestamp.includes('+') || timestamp.includes('-', 10)) {
    return new Date(timestamp);
  }
  // Otherwise, append Z to treat as UTC
  return new Date(timestamp + 'Z');
}

/**
 * Find arrival time from GPS history for a job location
 * Filters GPS points to only those after the window start, then finds first arrival
 *
 * IMPORTANT: Verizon returns timestamps in UTC but without the Z suffix.
 * We append Z when parsing to correctly interpret them as UTC.
 */
export function findArrivalTime<T extends { Latitude: number; Longitude: number; UpdateUtc: string }>(
  gpsPoints: T[],
  targetLat: number,
  targetLon: number,
  windowStart: Date,
  radiusFeet: number = ARRIVAL_RADIUS_FEET
): { arrivalTime: Date; point: T; distanceFeet: number } | null {
  // Sort by timestamp ascending (parse as UTC)
  const sortedPoints = [...gpsPoints].sort(
    (a, b) => parseVerizonUtcTime(a.UpdateUtc).getTime() - parseVerizonUtcTime(b.UpdateUtc).getTime()
  );

  // Find first point within radius that's after the window start
  for (const point of sortedPoints) {
    const pointTime = parseVerizonUtcTime(point.UpdateUtc);
    if (pointTime >= windowStart) {
      const distance = calculateDistanceFeet(point.Latitude, point.Longitude, targetLat, targetLon);
      if (distance <= radiusFeet) {
        return { arrivalTime: pointTime, point, distanceFeet: distance };
      }
    }
  }

  return null;
}

/**
 * Parse Verizon UTC timestamp - exported for use in other modules
 */
export function parseVerizonUtcTimestamp(timestamp: string): Date {
  // If it already ends with Z or has timezone info, parse as-is
  if (timestamp.endsWith('Z') || timestamp.includes('+') || timestamp.includes('-', 10)) {
    return new Date(timestamp);
  }
  // Otherwise, append Z to treat as UTC
  return new Date(timestamp + 'Z');
}

/**
 * Find arrival from vehicle segments (trip end times)
 * This is more accurate than GPS proximity because it uses the actual
 * time the truck stopped (segment end = ignition off / parked)
 *
 * @param segments - Vehicle segments from Verizon API
 * @param targetLat - Job location latitude
 * @param targetLon - Job location longitude
 * @param windowStart - Only consider segments ending after this time
 * @param radiusFeet - Radius to consider as "at job location"
 * @returns Arrival info or null if no matching segment found
 */
export function findArrivalFromSegments(
  segments: VehicleSegment[],
  targetLat: number,
  targetLon: number,
  windowStart: Date,
  radiusFeet: number = ARRIVAL_RADIUS_FEET
): { arrivalTime: Date; segment: VehicleSegment; distanceFeet: number } | null {
  // Filter and sort segments by end time
  const validSegments = segments
    .filter(seg => seg.EndDateUtc && seg.EndLocation) // Must have end time and location
    .sort((a, b) =>
      parseVerizonUtcTimestamp(a.EndDateUtc!).getTime() - parseVerizonUtcTimestamp(b.EndDateUtc!).getTime()
    );

  // Find first segment that ends near the job location after window start
  for (const segment of validSegments) {
    const endTime = parseVerizonUtcTimestamp(segment.EndDateUtc!);

    if (endTime >= windowStart) {
      const distance = calculateDistanceFeet(
        segment.EndLocation!.Latitude,
        segment.EndLocation!.Longitude,
        targetLat,
        targetLon
      );

      if (distance <= radiusFeet) {
        return {
          arrivalTime: endTime,
          segment,
          distanceFeet: distance,
        };
      }
    }
  }

  return null;
}

/**
 * Office location configuration
 * Used to detect when technicians visit the office/shop
 */
export const OFFICE_LOCATION = {
  latitude: 36.06693377330104,
  longitude: -79.86402542389432,
  radiusFeet: 500, // Account for parking lot, GPS drift
};

/**
 * Office visit types
 */
export type OfficeVisitType = 'morning_departure' | 'mid_day_visit' | 'end_of_day';

/**
 * Detected office visit
 */
export interface OfficeVisit {
  arrivalTime: Date | null;    // null for morning_departure
  departureTime: Date | null;  // null for end_of_day
  durationMinutes: number | null;
  visitType: OfficeVisitType;
}

/**
 * Check if a location is near the office
 */
export function isNearOffice(lat: number, lon: number): boolean {
  return isWithinRadius(
    lat,
    lon,
    OFFICE_LOCATION.latitude,
    OFFICE_LOCATION.longitude,
    OFFICE_LOCATION.radiusFeet
  );
}

/**
 * Detect office visits from vehicle segments
 *
 * Logic:
 * - If first segment STARTS at office -> morning_departure (truck parked overnight)
 * - If segment ENDS at office -> potential visit
 *   - If it's the last segment of the day -> end_of_day
 *   - Otherwise -> mid_day_visit (track arrival, find next segment for departure)
 *
 * @param segments - Vehicle segments from Verizon API (should be for a single day)
 * @returns Array of detected office visits
 */
export function detectOfficeVisits(segments: VehicleSegment[]): OfficeVisit[] {
  if (!segments || segments.length === 0) {
    return [];
  }

  const visits: OfficeVisit[] = [];

  // Sort segments by start time
  const sortedSegments = [...segments]
    .filter(seg => seg.StartDateUtc && seg.StartLocation)
    .sort((a, b) =>
      parseVerizonUtcTimestamp(a.StartDateUtc!).getTime() - parseVerizonUtcTimestamp(b.StartDateUtc!).getTime()
    );

  if (sortedSegments.length === 0) {
    return [];
  }

  // Check first segment - does it START at office? (truck parked overnight)
  const firstSegment = sortedSegments[0];
  if (firstSegment.StartLocation && isNearOffice(firstSegment.StartLocation.Latitude, firstSegment.StartLocation.Longitude)) {
    const departureTime = parseVerizonUtcTimestamp(firstSegment.StartDateUtc!);
    visits.push({
      arrivalTime: null, // We don't know when they arrived (previous day)
      departureTime,
      durationMinutes: null, // Can't calculate without arrival
      visitType: 'morning_departure',
    });
  }

  // Check each segment's end location for arrivals at office
  for (let i = 0; i < sortedSegments.length; i++) {
    const segment = sortedSegments[i];

    // Skip if no end location
    if (!segment.EndLocation || !segment.EndDateUtc) {
      continue;
    }

    // Check if segment ends at office
    if (isNearOffice(segment.EndLocation.Latitude, segment.EndLocation.Longitude)) {
      const arrivalTime = parseVerizonUtcTimestamp(segment.EndDateUtc);

      // Is this the last segment? -> end_of_day
      if (i === sortedSegments.length - 1) {
        visits.push({
          arrivalTime,
          departureTime: null, // Still there at end of data
          durationMinutes: null,
          visitType: 'end_of_day',
        });
      } else {
        // Mid-day visit - find departure time from next segment's start
        const nextSegment = sortedSegments[i + 1];
        let departureTime: Date | null = null;
        let durationMinutes: number | null = null;

        if (nextSegment.StartDateUtc) {
          departureTime = parseVerizonUtcTimestamp(nextSegment.StartDateUtc);
          durationMinutes = Math.round((departureTime.getTime() - arrivalTime.getTime()) / 60000);
        }

        visits.push({
          arrivalTime,
          departureTime,
          durationMinutes,
          visitType: 'mid_day_visit',
        });
      }
    }
  }

  return visits;
}
