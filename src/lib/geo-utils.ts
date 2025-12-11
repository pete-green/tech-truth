// Geo utilities for calculating distances between GPS coordinates

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
 * Find arrival time from GPS history for a job location
 * Filters GPS points to only those after the window start, then finds first arrival
 */
export function findArrivalTime<T extends { Latitude: number; Longitude: number; UpdateUtc: string }>(
  gpsPoints: T[],
  targetLat: number,
  targetLon: number,
  windowStart: Date,
  radiusFeet: number = ARRIVAL_RADIUS_FEET
): { arrivalTime: Date; point: T } | null {
  // Sort by timestamp ascending
  const sortedPoints = [...gpsPoints].sort(
    (a, b) => new Date(a.UpdateUtc).getTime() - new Date(b.UpdateUtc).getTime()
  );

  // Find first point within radius that's after the window start
  for (const point of sortedPoints) {
    const pointTime = new Date(point.UpdateUtc);
    if (pointTime >= windowStart) {
      if (isWithinRadius(point.Latitude, point.Longitude, targetLat, targetLon, radiusFeet)) {
        return { arrivalTime: pointTime, point };
      }
    }
  }

  return null;
}
