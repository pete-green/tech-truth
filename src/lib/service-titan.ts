// Service Titan API client for Tech Truth

const ST_CONFIG = {
  baseUrl: process.env.ST_BASE_URL || 'https://api.servicetitan.io',
  authUrl: process.env.ST_AUTH_URL || 'https://auth.servicetitan.io/connect/token',
  tenantId: process.env.ST_TENANT_ID || '',
  applicationKey: process.env.ST_APPLICATION_KEY || '',
  clientId: process.env.ST_CLIENT_ID || '',
  clientSecret: process.env.ST_CLIENT_SECRET || '',
};

// Token cache (in-memory, resets on cold start)
let cachedToken: string | null = null;
let tokenExpiry: Date | null = null;

export async function getServiceTitanToken(): Promise<string> {
  // Check if we have a valid cached token
  if (cachedToken && tokenExpiry && tokenExpiry > new Date()) {
    return cachedToken;
  }

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: ST_CONFIG.clientId,
    client_secret: ST_CONFIG.clientSecret,
  });

  const response = await fetch(ST_CONFIG.authUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to authenticate with Service Titan: ${errorText}`);
  }

  const tokenData = await response.json();
  cachedToken = tokenData.access_token;
  const expiresIn = tokenData.expires_in || 3600;

  // Calculate expiry time (subtract 5 minutes for safety)
  tokenExpiry = new Date();
  tokenExpiry.setSeconds(tokenExpiry.getSeconds() + expiresIn - 300);

  return cachedToken!;
}

async function stFetch(endpoint: string, options: RequestInit = {}) {
  const token = await getServiceTitanToken();

  const url = `${ST_CONFIG.baseUrl}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'ST-App-Key': ST_CONFIG.applicationKey,
      Accept: 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Service Titan API error: ${errorText}`);
  }

  return response.json();
}

// Get all technicians
export async function getTechnicians(params?: { active?: boolean; page?: number; pageSize?: number }) {
  const queryParams = new URLSearchParams();
  if (params?.active !== undefined) queryParams.append('active', String(params.active));
  if (params?.page) queryParams.append('page', String(params.page));
  if (params?.pageSize) queryParams.append('pageSize', String(params.pageSize));

  const query = queryParams.toString();
  const endpoint = `/settings/v2/tenant/${ST_CONFIG.tenantId}/technicians${query ? `?${query}` : ''}`;

  return stFetch(endpoint);
}

// Get technician by ID
export async function getTechnician(technicianId: number) {
  const endpoint = `/settings/v2/tenant/${ST_CONFIG.tenantId}/technicians/${technicianId}`;
  return stFetch(endpoint);
}

// Get appointments for a date range
export async function getAppointments(params: {
  startsOnOrAfter: string;
  startsBefore: string;
  technicianId?: number;
  page?: number;
  pageSize?: number;
}) {
  const queryParams = new URLSearchParams();
  queryParams.append('startsOnOrAfter', params.startsOnOrAfter);
  queryParams.append('startsBefore', params.startsBefore);
  if (params.technicianId) queryParams.append('technicianId', String(params.technicianId));
  if (params.page) queryParams.append('page', String(params.page));
  if (params.pageSize) queryParams.append('pageSize', String(params.pageSize));

  const endpoint = `/jpm/v2/tenant/${ST_CONFIG.tenantId}/appointments?${queryParams.toString()}`;
  return stFetch(endpoint);
}

// Get job details
export async function getJob(jobId: number) {
  const endpoint = `/jpm/v2/tenant/${ST_CONFIG.tenantId}/jobs/${jobId}`;
  return stFetch(endpoint);
}

// Get jobs for a date range
export async function getJobs(params: {
  completedOnOrAfter?: string;
  completedBefore?: string;
  modifiedOnOrAfter?: string;
  page?: number;
  pageSize?: number;
}) {
  const queryParams = new URLSearchParams();
  if (params.completedOnOrAfter) queryParams.append('completedOnOrAfter', params.completedOnOrAfter);
  if (params.completedBefore) queryParams.append('completedBefore', params.completedBefore);
  if (params.modifiedOnOrAfter) queryParams.append('modifiedOnOrAfter', params.modifiedOnOrAfter);
  if (params.page) queryParams.append('page', String(params.page));
  if (params.pageSize) queryParams.append('pageSize', String(params.pageSize));

  const endpoint = `/jpm/v2/tenant/${ST_CONFIG.tenantId}/jobs?${queryParams.toString()}`;
  return stFetch(endpoint);
}

// Get appointment assignments (which technicians are assigned to which appointments)
export async function getAppointmentAssignments(params: {
  startsOnOrAfter: string;
  startsBefore: string;
  page?: number;
  pageSize?: number;
}) {
  const queryParams = new URLSearchParams();
  queryParams.append('startsOnOrAfter', params.startsOnOrAfter);
  queryParams.append('startsBefore', params.startsBefore);
  if (params.page) queryParams.append('page', String(params.page));
  if (params.pageSize) queryParams.append('pageSize', String(params.pageSize));

  const endpoint = `/dispatch/v2/tenant/${ST_CONFIG.tenantId}/appointment-assignments?${queryParams.toString()}`;
  return stFetch(endpoint);
}

export { ST_CONFIG };
