/**
 * Google Directions API utility for calculating drive times between locations
 */

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

export interface DirectionsResult {
  durationMinutes: number;
  durationInTrafficMinutes: number | null; // Only available with departure_time
  distanceMiles: number;
  status: 'ok' | 'not_found' | 'zero_results' | 'error';
  errorMessage?: string;
}

// Simple in-memory cache for directions results
// Key format: "lat1,lon1|lat2,lon2" rounded to 4 decimal places
const directionsCache = new Map<string, { result: DirectionsResult; timestamp: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getCacheKey(originLat: number, originLon: number, destLat: number, destLon: number): string {
  // Round to 4 decimal places (~11 meter precision) to improve cache hit rate
  const roundTo4 = (n: number) => Math.round(n * 10000) / 10000;
  return `${roundTo4(originLat)},${roundTo4(originLon)}|${roundTo4(destLat)},${roundTo4(destLon)}`;
}

/**
 * Get driving duration between two points using Google Directions API
 *
 * @param originLat Origin latitude
 * @param originLon Origin longitude
 * @param destLat Destination latitude
 * @param destLon Destination longitude
 * @param departureTime Optional departure time for traffic-based estimates
 * @returns DirectionsResult with duration and distance
 */
export async function getDrivingDuration(
  originLat: number,
  originLon: number,
  destLat: number,
  destLon: number,
  departureTime?: Date
): Promise<DirectionsResult> {
  if (!GOOGLE_MAPS_API_KEY) {
    console.error('[Google Directions] No API key configured');
    return {
      durationMinutes: 0,
      durationInTrafficMinutes: null,
      distanceMiles: 0,
      status: 'error',
      errorMessage: 'Google Maps API key not configured',
    };
  }

  // Check cache first (without departure time for general caching)
  const cacheKey = getCacheKey(originLat, originLon, destLat, destLon);
  const cached = directionsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    console.log(`[Google Directions] Cache hit for ${cacheKey}`);
    return cached.result;
  }

  try {
    const origin = `${originLat},${originLon}`;
    const destination = `${destLat},${destLon}`;

    let url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&mode=driving&key=${GOOGLE_MAPS_API_KEY}`;

    // Add departure_time for traffic estimates (must be in the future or now)
    if (departureTime) {
      const timestamp = Math.floor(departureTime.getTime() / 1000);
      url += `&departure_time=${timestamp}`;
    }

    console.log(`[Google Directions] Fetching route from (${originLat}, ${originLon}) to (${destLat}, ${destLon})`);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.status === 'ZERO_RESULTS') {
      const result: DirectionsResult = {
        durationMinutes: 0,
        durationInTrafficMinutes: null,
        distanceMiles: 0,
        status: 'zero_results',
        errorMessage: 'No route found between these locations',
      };
      return result;
    }

    if (data.status !== 'OK') {
      const result: DirectionsResult = {
        durationMinutes: 0,
        durationInTrafficMinutes: null,
        distanceMiles: 0,
        status: 'error',
        errorMessage: data.error_message || `API returned status: ${data.status}`,
      };
      return result;
    }

    const route = data.routes[0];
    const leg = route.legs[0];

    // Duration is in seconds
    const durationSeconds = leg.duration.value;
    const durationMinutes = Math.round(durationSeconds / 60);

    // Duration in traffic (only available with departure_time)
    let durationInTrafficMinutes: number | null = null;
    if (leg.duration_in_traffic) {
      durationInTrafficMinutes = Math.round(leg.duration_in_traffic.value / 60);
    }

    // Distance is in meters
    const distanceMeters = leg.distance.value;
    const distanceMiles = Math.round((distanceMeters / 1609.344) * 10) / 10; // Round to 1 decimal

    const result: DirectionsResult = {
      durationMinutes,
      durationInTrafficMinutes,
      distanceMiles,
      status: 'ok',
    };

    // Cache the result
    directionsCache.set(cacheKey, { result, timestamp: Date.now() });
    console.log(`[Google Directions] Route found: ${durationMinutes} min, ${distanceMiles} miles`);

    return result;
  } catch (error: any) {
    console.error('[Google Directions] Error fetching directions:', error);
    return {
      durationMinutes: 0,
      durationInTrafficMinutes: null,
      distanceMiles: 0,
      status: 'error',
      errorMessage: error.message || 'Failed to fetch directions',
    };
  }
}

/**
 * Clear the directions cache (useful for testing or memory management)
 */
export function clearDirectionsCache(): void {
  directionsCache.clear();
}

/**
 * Get cache statistics
 */
export function getDirectionsCacheStats(): { size: number; oldestEntry: number | null } {
  let oldest: number | null = null;
  for (const entry of directionsCache.values()) {
    if (oldest === null || entry.timestamp < oldest) {
      oldest = entry.timestamp;
    }
  }
  return {
    size: directionsCache.size,
    oldestEntry: oldest,
  };
}
