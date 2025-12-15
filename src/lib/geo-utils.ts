// Geo utilities for calculating distances between GPS coordinates
import type { VehicleSegment } from './verizon-connect';

/**
 * Geocode an address to lat/lng coordinates using OpenStreetMap Nominatim
 * Free service, no API key required, but has rate limits (1 req/sec)
 *
 * @param address - Full address string (e.g., "123 Main St, Greensboro, NC 27401")
 * @returns Coordinates or null if geocoding failed
 */
export async function geocodeAddress(address: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const encodedAddress = encodeURIComponent(address);
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1`,
      {
        headers: {
          'User-Agent': 'TechTruth/1.0 (Technician Tracking Application)',
        },
      }
    );

    if (!response.ok) {
      console.error(`Geocoding failed with status ${response.status}`);
      return null;
    }

    const results = await response.json();

    if (results && results.length > 0) {
      return {
        lat: parseFloat(results[0].lat),
        lon: parseFloat(results[0].lon),
      };
    }

    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

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
 * Check if a point is inside a polygon using the ray-casting algorithm
 * @param lat - Point latitude
 * @param lng - Point longitude
 * @param polygon - Array of [lat, lng] coordinate pairs defining the polygon vertices
 * @returns true if point is inside the polygon
 */
export function isPointInPolygon(
  lat: number,
  lng: number,
  polygon: [number, number][]
): boolean {
  if (!polygon || polygon.length < 3) {
    return false;
  }

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];

    if (((yi > lat) !== (yj > lat)) &&
        (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
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
  isUnnecessary?: boolean;     // Flag for take-home truck techs who stopped at office before first job
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
 * Technician configuration for office visit detection
 */
export interface TechOfficeConfig {
  takesTruckHome?: boolean;
  homeLocation?: { lat: number; lon: number } | null;
}

/**
 * Radius for determining if truck started from "home" (500 feet)
 */
export const HOME_RADIUS_FEET = 500;

/**
 * Detect office visits from vehicle segments
 *
 * Logic:
 * - Consolidate consecutive visits within 15 minutes into a single visit
 * - If truck starts day at office -> morning_departure
 * - If arrival is BEFORE first job scheduled time -> morning_departure (getting ready)
 * - If arrival is AFTER 5 PM Eastern -> end_of_day
 * - Otherwise -> mid_day_visit (the problematic ones)
 *
 * Unnecessary visit detection:
 * - If tech takes truck home AND has home location set
 * - AND truck actually started from within 500ft of home
 * - AND has first job scheduled
 * - AND went to office before first job
 * - -> isUnnecessary = true
 *
 * @param segments - Vehicle segments from Verizon API (should be for a single day)
 * @param firstJobScheduledTime - When the tech's first job is scheduled (to distinguish morning from mid-day)
 * @param techConfig - Optional technician configuration (takes truck home, home location)
 * @returns Array of detected office visits
 */
export function detectOfficeVisits(
  segments: VehicleSegment[],
  firstJobScheduledTime?: Date,
  techConfig?: TechOfficeConfig
): OfficeVisit[] {
  if (!segments || segments.length === 0) {
    return [];
  }

  // Sort segments by start time
  const sortedSegments = [...segments]
    .filter(seg => seg.StartDateUtc && seg.StartLocation)
    .sort((a, b) =>
      parseVerizonUtcTimestamp(a.StartDateUtc!).getTime() - parseVerizonUtcTimestamp(b.StartDateUtc!).getTime()
    );

  if (sortedSegments.length === 0) {
    return [];
  }

  // First, collect all raw office arrivals/departures
  const rawVisits: { arrivalTime: Date; departureTime: Date | null }[] = [];

  // Check first segment - does it START at office? (truck parked overnight)
  const firstSegment = sortedSegments[0];
  const startsAtOffice = firstSegment.StartLocation &&
    isNearOffice(firstSegment.StartLocation.Latitude, firstSegment.StartLocation.Longitude);

  // Check if truck started from home (for unnecessary visit detection)
  // Only relevant if tech takes truck home AND we have their home location
  let startedFromHome = false;
  if (techConfig?.takesTruckHome && techConfig?.homeLocation && firstSegment.StartLocation) {
    startedFromHome = isWithinRadius(
      firstSegment.StartLocation.Latitude,
      firstSegment.StartLocation.Longitude,
      techConfig.homeLocation.lat,
      techConfig.homeLocation.lon,
      HOME_RADIUS_FEET
    );
  }

  if (startsAtOffice) {
    const departureTime = parseVerizonUtcTimestamp(firstSegment.StartDateUtc!);
    rawVisits.push({
      arrivalTime: departureTime, // Use departure as arrival for morning (we don't know actual arrival)
      departureTime,
    });
  }

  // Find all segments that END at office
  for (let i = 0; i < sortedSegments.length; i++) {
    const segment = sortedSegments[i];

    if (!segment.EndLocation || !segment.EndDateUtc) {
      continue;
    }

    if (isNearOffice(segment.EndLocation.Latitude, segment.EndLocation.Longitude)) {
      const arrivalTime = parseVerizonUtcTimestamp(segment.EndDateUtc);

      // Find departure time from next segment's start (if it exists and starts at office)
      let departureTime: Date | null = null;
      if (i < sortedSegments.length - 1) {
        const nextSegment = sortedSegments[i + 1];
        if (nextSegment.StartDateUtc) {
          departureTime = parseVerizonUtcTimestamp(nextSegment.StartDateUtc);
        }
      }

      rawVisits.push({ arrivalTime, departureTime });
    }
  }

  // Consolidate visits within 15 minutes of each other
  const CONSOLIDATION_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
  const consolidatedVisits: { arrivalTime: Date; departureTime: Date | null }[] = [];

  for (const visit of rawVisits) {
    const lastConsolidated = consolidatedVisits[consolidatedVisits.length - 1];

    if (lastConsolidated) {
      // Check if this visit is within 15 min of the last one's departure
      const lastDeparture = lastConsolidated.departureTime || lastConsolidated.arrivalTime;
      const timeDiff = visit.arrivalTime.getTime() - lastDeparture.getTime();

      if (timeDiff <= CONSOLIDATION_WINDOW_MS) {
        // Extend the existing visit
        lastConsolidated.departureTime = visit.departureTime;
        continue;
      }
    }

    consolidatedVisits.push({ ...visit });
  }

  // Now classify each consolidated visit
  const END_OF_DAY_HOUR = 17; // 5 PM Eastern
  const visits: OfficeVisit[] = [];

  for (let i = 0; i < consolidatedVisits.length; i++) {
    const visit = consolidatedVisits[i];
    const arrivalTime = visit.arrivalTime;
    const departureTime = visit.departureTime;

    // Calculate duration if we have both times
    let durationMinutes: number | null = null;
    if (departureTime) {
      durationMinutes = Math.round((departureTime.getTime() - arrivalTime.getTime()) / 60000);
    }

    // Classify the visit
    let visitType: OfficeVisitType;

    // First visit of the day starting at office = morning_departure
    // Determine if this is an unnecessary visit (take-home truck went to office before first job)
    let isUnnecessary = false;

    if (i === 0 && startsAtOffice) {
      visitType = 'morning_departure';
      // If truck started at office but tech supposedly takes it home, they left it at office
      // This is NOT unnecessary - they had to come get the truck
    }
    // Before first job scheduled time = morning (getting ready, loading truck, etc.)
    else if (firstJobScheduledTime && arrivalTime.getTime() < firstJobScheduledTime.getTime()) {
      // Only flag as unnecessary if:
      // 1. Tech takes truck home
      // 2. We have their home location set
      // 3. Truck actually started from near home (within 500ft)
      // 4. They went to office before their first job
      if (startedFromHome) {
        visitType = 'mid_day_visit'; // Reclassify as problematic
        isUnnecessary = true;
      } else {
        visitType = 'morning_departure';
      }
    }
    // After 5 PM = end of day
    else if (arrivalTime.getUTCHours() >= (END_OF_DAY_HOUR + 5)) { // +5 for EST to UTC rough conversion
      visitType = 'end_of_day';
    }
    // Last visit with no departure = end of day
    else if (i === consolidatedVisits.length - 1 && !departureTime) {
      visitType = 'end_of_day';
    }
    // Everything else = mid-day visit (the problem ones)
    else {
      visitType = 'mid_day_visit';
    }

    visits.push({
      arrivalTime: visitType === 'morning_departure' && i === 0 && startsAtOffice ? null : arrivalTime,
      departureTime,
      durationMinutes,
      visitType,
      isUnnecessary: isUnnecessary || undefined,
    });
  }

  return visits;
}

/**
 * Home location suggestion from GPS analysis
 */
export interface HomeLocationSuggestion {
  latitude: number;
  longitude: number;
  address: string;
  confidence: 'high' | 'medium' | 'low';
  daysDetected: number;
  totalDaysAnalyzed: number;
}

/**
 * Daily first segment data for home detection
 */
export interface DailyFirstSegment {
  date: string;
  startLat: number;
  startLon: number;
  address: string;
}

/**
 * Detect home location from GPS patterns
 * Analyzes where the truck starts each day to suggest likely home location
 *
 * @param dailyFirstSegments - First segment of each day with start location
 * @returns Home location suggestion or null if no consistent pattern found
 */
export function detectHomeLocation(
  dailyFirstSegments: DailyFirstSegment[]
): HomeLocationSuggestion | null {
  if (!dailyFirstSegments || dailyFirstSegments.length < 5) {
    // Need at least 5 days of data for meaningful analysis
    return null;
  }

  // Filter out days that start at the office (we want home starts only)
  const nonOfficeStarts = dailyFirstSegments.filter(
    seg => !isNearOffice(seg.startLat, seg.startLon)
  );

  if (nonOfficeStarts.length < 3) {
    // Not enough non-office starts to detect home
    return null;
  }

  // Cluster locations that are within 500 feet of each other
  const CLUSTER_RADIUS_FEET = 500;
  const clusters: { center: DailyFirstSegment; members: DailyFirstSegment[] }[] = [];

  for (const segment of nonOfficeStarts) {
    let foundCluster = false;

    for (const cluster of clusters) {
      const distance = calculateDistanceFeet(
        segment.startLat,
        segment.startLon,
        cluster.center.startLat,
        cluster.center.startLon
      );

      if (distance <= CLUSTER_RADIUS_FEET) {
        cluster.members.push(segment);
        foundCluster = true;
        break;
      }
    }

    if (!foundCluster) {
      // Start a new cluster
      clusters.push({ center: segment, members: [segment] });
    }
  }

  // Find the largest cluster
  const largestCluster = clusters.reduce((largest, current) =>
    current.members.length > largest.members.length ? current : largest
  );

  // Calculate confidence based on consistency
  const daysDetected = largestCluster.members.length;
  const totalDaysAnalyzed = dailyFirstSegments.length;
  const consistencyRatio = daysDetected / nonOfficeStarts.length;

  let confidence: 'high' | 'medium' | 'low';
  if (consistencyRatio >= 0.8 && daysDetected >= 10) {
    confidence = 'high';
  } else if (consistencyRatio >= 0.5 && daysDetected >= 5) {
    confidence = 'medium';
  } else if (daysDetected >= 3) {
    confidence = 'low';
  } else {
    // Not enough consistent data
    return null;
  }

  // Calculate average position of the cluster
  const avgLat = largestCluster.members.reduce((sum, m) => sum + m.startLat, 0) / daysDetected;
  const avgLon = largestCluster.members.reduce((sum, m) => sum + m.startLon, 0) / daysDetected;

  // Use the most common address in the cluster (or the center's address)
  const addressCounts: Record<string, number> = {};
  for (const member of largestCluster.members) {
    if (member.address) {
      addressCounts[member.address] = (addressCounts[member.address] || 0) + 1;
    }
  }
  const mostCommonAddress = Object.entries(addressCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || largestCluster.center.address || 'Unknown Address';

  return {
    latitude: avgLat,
    longitude: avgLon,
    address: mostCommonAddress,
    confidence,
    daysDetected,
    totalDaysAnalyzed,
  };
}
