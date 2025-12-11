// Verizon Connect (Fleetmatics) API client for Tech Truth

const VERIZON_CONFIG = {
  apiUrl: process.env.VERIZON_API_URL || 'https://fim.api.us.fleetmatics.com',
  username: process.env.VERIZON_USERNAME || '',
  password: process.env.VERIZON_PASSWORD || '',
  // This is the correct APP_ID from the working Warehouse Operations implementation
  appId: 'fleetmatics-p-us-IsVqHeP2nslCQYVYMBTpbPiFW6udcPl14dw5GAbA',
};

// Token cache
let cachedToken: string | null = null;
let tokenExpiry: Date | null = null;

function getBasicAuthHeader(): string {
  const credentials = `${VERIZON_CONFIG.username}:${VERIZON_CONFIG.password}`;
  return `Basic ${Buffer.from(credentials).toString('base64')}`;
}

export async function getVerizonToken(): Promise<string> {
  // Check if we have a valid cached token
  if (cachedToken && tokenExpiry && tokenExpiry > new Date()) {
    return cachedToken;
  }

  const response = await fetch(`${VERIZON_CONFIG.apiUrl}/token`, {
    method: 'GET',
    headers: {
      Authorization: getBasicAuthHeader(),
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to authenticate with Verizon Connect: ${errorText}`);
  }

  // Verizon returns the token as raw text (JWT), not JSON
  const tokenText = await response.text();

  // Check if it's JSON or raw token
  if (tokenText.startsWith('{')) {
    const tokenData = JSON.parse(tokenText);
    cachedToken = tokenData.token || tokenData.Token;
  } else {
    // It's a raw JWT token
    cachedToken = tokenText;
  }

  // Token typically expires in 1 hour, subtract 5 minutes for safety
  tokenExpiry = new Date();
  tokenExpiry.setMinutes(tokenExpiry.getMinutes() + 55);

  return cachedToken!;
}

async function verizonFetch(endpoint: string, options: RequestInit = {}) {
  const token = await getVerizonToken();

  const url = `${VERIZON_CONFIG.apiUrl}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Atmosphere atmosphere_app_id=${VERIZON_CONFIG.appId}, Bearer ${token}`,
      Accept: 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Verizon Connect API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

// Get all vehicles
export async function getVehicles() {
  return verizonFetch('/rad/v1/vehicles');
}

// Get vehicle by ID
export async function getVehicle(vehicleId: string) {
  return verizonFetch(`/rad/v1/vehicles/${vehicleId}`);
}

// Get current location of all vehicles
export async function getAllVehicleLocations() {
  return verizonFetch('/rad/v1/vehicles/locations');
}

// Get current location of a specific vehicle
export async function getVehicleLocation(vehicleId: string) {
  return verizonFetch(`/rad/v1/vehicles/${vehicleId}/location`);
}

// Get vehicle location history for a time range (OLD endpoint - doesn't work)
// Keeping for backwards compatibility but use getVehicleGPSHistory instead
export async function getVehicleLocationHistory(
  vehicleId: string,
  startTime: string,
  endTime: string
) {
  const params = new URLSearchParams({
    startTime,
    endTime,
  });
  return verizonFetch(`/rad/v1/vehicles/${vehicleId}/locations?${params.toString()}`);
}

// GPS History Point interface for the status/history endpoint
export interface GPSHistoryPoint {
  VehicleNumber: string;
  VehicleName: string;
  UpdateUtc: string;
  OdometerInKM: number;
  IsPrivate: boolean;
  DriverNumber: string | null;
  FirstName: string | null;
  LastName: string | null;
  Address: {
    AddressLine1: string;
    AddressLine2: string;
    Locality: string;
    AdministrativeArea: string;
    PostalCode: string;
    Country: string;
  };
  Latitude: number;
  Longitude: number;
  Speed: number;
  BatteryLevel: number | null;
}

/**
 * Get vehicle GPS history for a time range using the correct endpoint
 * @param vehicleNumber - The vehicle number (e.g., "2021")
 * @param startTime - ISO 8601 timestamp (e.g., "2025-12-11T06:00:00.000Z")
 * @param endTime - ISO 8601 timestamp
 * @returns Array of GPS history points
 */
export async function getVehicleGPSHistory(
  vehicleNumber: string,
  startTime: string,
  endTime: string
): Promise<GPSHistoryPoint[]> {
  const params = new URLSearchParams({
    startdatetimeutc: startTime,
    enddatetimeutc: endTime,
  });
  return verizonFetch(`/rad/v1/vehicles/${vehicleNumber}/status/history?${params.toString()}`);
}

// Get driver information
export async function getDrivers() {
  return verizonFetch('/rad/v1/drivers');
}

// Get driver by ID
export async function getDriver(driverId: string) {
  return verizonFetch(`/rad/v1/drivers/${driverId}`);
}

export interface VehicleLocation {
  vehicleId: string;
  vehicleNumber: string;
  driverName?: string;
  latitude: number;
  longitude: number;
  heading: number;
  speed: number;
  timestamp: string;
  address?: string;
  ignitionStatus?: string;
}

export { VERIZON_CONFIG };
