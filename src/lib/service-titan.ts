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
// NOTE: The date filters on this endpoint filter by assignedOn (when tech was assigned),
// NOT by appointment date. Use getAppointmentAssignmentsByJobId for specific jobs.
export async function getAppointmentAssignments(params: {
  startsOnOrAfter?: string;
  startsBefore?: string;
  jobId?: number;
  page?: number;
  pageSize?: number;
}) {
  const queryParams = new URLSearchParams();
  if (params.startsOnOrAfter) queryParams.append('startsOnOrAfter', params.startsOnOrAfter);
  if (params.startsBefore) queryParams.append('startsBefore', params.startsBefore);
  if (params.jobId) queryParams.append('jobId', String(params.jobId));
  if (params.page) queryParams.append('page', String(params.page));
  if (params.pageSize) queryParams.append('pageSize', String(params.pageSize));

  const endpoint = `/dispatch/v2/tenant/${ST_CONFIG.tenantId}/appointment-assignments?${queryParams.toString()}`;
  return stFetch(endpoint);
}

// Get appointment assignment by job ID (preferred method for looking up tech assignments)
export async function getAppointmentAssignmentsByJobId(jobId: number) {
  const endpoint = `/dispatch/v2/tenant/${ST_CONFIG.tenantId}/appointment-assignments?jobId=${jobId}`;
  return stFetch(endpoint);
}

// Get location details (includes address with lat/lng coordinates)
export async function getLocation(locationId: number) {
  const endpoint = `/crm/v2/tenant/${ST_CONFIG.tenantId}/locations/${locationId}`;
  return stFetch(endpoint);
}

// Get customer details
export async function getCustomer(customerId: number) {
  const endpoint = `/crm/v2/tenant/${ST_CONFIG.tenantId}/customers/${customerId}`;
  return stFetch(endpoint);
}

// Get job type details
export async function getJobType(jobTypeId: number) {
  const endpoint = `/jpm/v2/tenant/${ST_CONFIG.tenantId}/job-types/${jobTypeId}`;
  return stFetch(endpoint);
}

// Cache for job types to avoid repeated API calls
const jobTypeCache = new Map<number, { name: string; isFollowUp: boolean }>();

// Get job type with caching and follow-up detection
// NOTE: "Follow up" = non-physical (phone/admin) - don't track
//       "Call back" = physical on-site visit - DO track like normal job
export async function getJobTypeWithCache(jobTypeId: number): Promise<{ name: string; isFollowUp: boolean }> {
  if (jobTypeCache.has(jobTypeId)) {
    return jobTypeCache.get(jobTypeId)!;
  }

  try {
    const jobType = await getJobType(jobTypeId);
    const name = jobType.name || '';
    const nameLower = name.toLowerCase();

    // Only "follow up" / "follow-up" are non-physical visits
    // "callback" / "call back" are real physical jobs and should be tracked
    const isFollowUp = (nameLower.includes('follow up') || nameLower.includes('follow-up')) &&
                       !nameLower.includes('callback') && !nameLower.includes('call back');

    const result = { name, isFollowUp };
    jobTypeCache.set(jobTypeId, result);
    return result;
  } catch (error) {
    // If we can't get job type, assume it's not a follow-up
    return { name: 'Unknown', isFollowUp: false };
  }
}

// ============================================
// ESTIMATES API
// ============================================

// Get estimates for a specific job
export async function getEstimatesByJobId(jobId: number) {
  const endpoint = `/sales/v2/tenant/${ST_CONFIG.tenantId}/estimates?jobId=${jobId}&pageSize=50`;
  return stFetch(endpoint);
}

// Get estimates by date range (for bulk sync)
export async function getEstimates(params: {
  createdOnOrAfter?: string;
  createdBefore?: string;
  soldAfter?: string;
  soldBefore?: string;
  modifiedOnOrAfter?: string;
  modifiedBefore?: string;
  active?: boolean;
  page?: number;
  pageSize?: number;
}) {
  const queryParams = new URLSearchParams();
  if (params.createdOnOrAfter) queryParams.append('createdOnOrAfter', params.createdOnOrAfter);
  if (params.createdBefore) queryParams.append('createdBefore', params.createdBefore);
  if (params.soldAfter) queryParams.append('soldAfter', params.soldAfter);
  if (params.soldBefore) queryParams.append('soldBefore', params.soldBefore);
  if (params.modifiedOnOrAfter) queryParams.append('modifiedOnOrAfter', params.modifiedOnOrAfter);
  if (params.modifiedBefore) queryParams.append('modifiedBefore', params.modifiedBefore);
  if (params.active !== undefined) queryParams.append('active', String(params.active));
  if (params.page) queryParams.append('page', String(params.page));
  if (params.pageSize) queryParams.append('pageSize', String(params.pageSize));

  const endpoint = `/sales/v2/tenant/${ST_CONFIG.tenantId}/estimates?${queryParams.toString()}`;
  return stFetch(endpoint);
}

// Get a single estimate by ID
export async function getEstimate(estimateId: number) {
  const endpoint = `/sales/v2/tenant/${ST_CONFIG.tenantId}/estimates/${estimateId}`;
  return stFetch(endpoint);
}

// Get estimate items (line items on an estimate)
export async function getEstimateItems(estimateId: number) {
  const endpoint = `/sales/v2/tenant/${ST_CONFIG.tenantId}/estimates/${estimateId}/items`;
  return stFetch(endpoint);
}

// TypeScript interfaces for API responses
export interface ServiceTitanLocation {
  id: number;
  customerId: number;
  active: boolean;
  name: string;
  address: {
    street: string;
    unit: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    latitude: number;
    longitude: number;
  };
  zoneId: number;
  taxZoneId: number;
}

export interface ServiceTitanJob {
  id: number;
  jobNumber: string;
  customerId: number;
  locationId: number;
  jobStatus: string;
  businessUnitId: number;
  jobTypeId: number;
  priority: string;
  appointmentCount: number;
  firstAppointmentId: number;
  lastAppointmentId: number;
  createdOn: string;
  modifiedOn: string;
}

export interface ServiceTitanAppointmentAssignment {
  id: number;
  technicianId: number;
  technicianName: string;
  appointmentId: number;
  jobId: number;
  assignedOn: string;
  status: string;
}

// Estimate interfaces
export interface ServiceTitanEstimate {
  id: number;
  jobId: number;
  projectId: number | null;
  locationId: number;
  customerId: number;
  name: string;
  jobNumber: string;
  status: {
    name: string;
    value: number;
  };
  summary: string;
  createdOn: string;
  modifiedOn: string;
  soldOn: string | null;
  soldBy: {
    id: number;
    name: string;
  } | null;
  subtotal: number;
  tax: number;
  total: number;
  active: boolean;
}

export interface ServiceTitanEstimateItem {
  id: number;
  skuId: number;
  skuName: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  type: string;
  isSold: boolean;
}

export interface ServiceTitanEstimatesResponse {
  page: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
  data: ServiceTitanEstimate[];
}

export interface ServiceTitanEstimateItemsResponse {
  page: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
  data: ServiceTitanEstimateItem[];
}

export { ST_CONFIG };
