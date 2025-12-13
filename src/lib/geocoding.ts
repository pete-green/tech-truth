/**
 * Geocoding utility using OpenStreetMap Nominatim API
 * Free to use with reasonable rate limits (~1 request/second)
 */

export interface GeocodingResult {
  latitude: number;
  longitude: number;
  displayName: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface GeocodingError {
  error: string;
  suggestions?: string[];
}

/**
 * Geocode an address to get coordinates
 * Uses OpenStreetMap Nominatim API (free, no API key required)
 *
 * @param address - The address to geocode
 * @returns GeocodingResult if successful, GeocodingError if failed
 */
export async function geocodeAddress(address: string): Promise<GeocodingResult | GeocodingError> {
  if (!address || address.trim().length < 5) {
    return { error: 'Address is too short. Please enter a complete address.' };
  }

  try {
    // URL encode the address
    const encodedAddress = encodeURIComponent(address.trim());

    // Call Nominatim API
    // Important: Include a User-Agent as required by Nominatim usage policy
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodedAddress}&format=json&limit=5&countrycodes=us&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'TechTruth/1.0 (technician-tracking-app)',
        },
      }
    );

    if (!response.ok) {
      return { error: 'Geocoding service unavailable. Please try again later.' };
    }

    const results = await response.json();

    if (!results || results.length === 0) {
      return {
        error: 'Address not found. Please check the address and try again.',
        suggestions: [
          'Include street number and name',
          'Include city and state',
          'Check for typos',
        ]
      };
    }

    // Get the best result
    const best = results[0];

    // Determine confidence based on Nominatim's importance score and type
    let confidence: 'high' | 'medium' | 'low' = 'medium';
    const importance = parseFloat(best.importance) || 0;
    const type = best.type || '';

    // High confidence: house/building level match with good importance
    if ((type === 'house' || type === 'building' || type === 'residential') && importance > 0.3) {
      confidence = 'high';
    }
    // Low confidence: only matched to city/town level
    else if (type === 'city' || type === 'town' || type === 'village' || type === 'administrative') {
      confidence = 'low';
    }

    return {
      latitude: parseFloat(best.lat),
      longitude: parseFloat(best.lon),
      displayName: best.display_name,
      confidence,
    };
  } catch (error: any) {
    console.error('Geocoding error:', error);
    return { error: 'Failed to validate address. Please try again.' };
  }
}

/**
 * Check if a geocoding response is an error
 */
export function isGeocodingError(result: GeocodingResult | GeocodingError): result is GeocodingError {
  return 'error' in result;
}
