// Paylocity API client for clock-in/clock-out (punch) data

// NextGen API config (for punch data, employee demographics, job codes)
const PAYLOCITY_CONFIG = {
  clientId: process.env.PAYLOCITY_NG_CLIENT_ID || '',
  clientSecret: process.env.PAYLOCITY_NG_CLIENT_SECRET || '',
  companyId: process.env.PAYLOCITY_COMPANY_ID || '',
  authUrl: process.env.PAYLOCITY_NG_AUTH_URL || 'https://dc1prodgwext.paylocity.com/public/security/v1/token',
  // Base URL WITHOUT /public - different endpoints have different path prefixes
  baseUrl: 'https://dc1prodgwext.paylocity.com',
};

let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Get authentication token for Paylocity API
 * Uses body parameters (not Basic Auth header) per Paylocity docs
 */
async function getToken(): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
    return cachedToken.token;
  }

  // Validate credentials are present
  if (!PAYLOCITY_CONFIG.clientId || !PAYLOCITY_CONFIG.clientSecret) {
    const missing = [];
    if (!PAYLOCITY_CONFIG.clientId) missing.push('PAYLOCITY_NG_CLIENT_ID');
    if (!PAYLOCITY_CONFIG.clientSecret) missing.push('PAYLOCITY_NG_CLIENT_SECRET');
    throw new Error(`Paylocity credentials missing: ${missing.join(', ')}. Check environment variables.`);
  }

  // Paylocity requires credentials in body, not header
  const params = new URLSearchParams();
  params.append('client_id', PAYLOCITY_CONFIG.clientId);
  params.append('client_secret', PAYLOCITY_CONFIG.clientSecret);
  params.append('grant_type', 'client_credentials');

  console.log(`Paylocity auth attempt - clientId length: ${PAYLOCITY_CONFIG.clientId.length}, authUrl: ${PAYLOCITY_CONFIG.authUrl}`);

  const response = await fetch(PAYLOCITY_CONFIG.authUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`Paylocity auth failed - status: ${response.status}, clientId length: ${PAYLOCITY_CONFIG.clientId.length}`);
    throw new Error(`Paylocity auth failed: ${response.status} - ${text}`);
  }

  const data = await response.json();

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000),
  };

  return cachedToken.token;
}

/**
 * Make authenticated request to Paylocity API
 */
async function paylocityFetch(path: string, options: RequestInit = {}): Promise<any> {
  const token = await getToken();

  const response = await fetch(`${PAYLOCITY_CONFIG.baseUrl}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  // For POST that returns location header (async operation)
  if (response.status === 202) {
    const location = response.headers.get('Location');
    // Extract operation ID from location URL
    const operationId = location ? location.split('/').pop() : null;
    return { location, operationId, status: 202 };
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Paylocity API error: ${response.status} - ${text}`);
  }

  return response.json();
}

/**
 * Poll for async operation completion
 */
async function waitForOperation(operationId: string, maxWaitMs: number = 60000): Promise<string> {
  const startTime = Date.now();
  const pollInterval = 1000; // 1 second

  while (Date.now() - startTime < maxWaitMs) {
    const status = await paylocityFetch(
      `/apiHub/time/v2/companies/${PAYLOCITY_CONFIG.companyId}/PunchDetailOperations/${operationId}`
    );

    const statusValue = status.status?.toLowerCase() || '';

    // Check for various "complete" statuses
    if (statusValue === 'complete' || statusValue === 'completed' || statusValue === 'succeeded') {
      // Resource ID is in the location URL
      let resourceId = status.resourceId || status.ResourceId;
      if (!resourceId && status.location) {
        resourceId = status.location.split('/').pop();
      }
      return resourceId || operationId;
    }

    if (statusValue === 'failed' || statusValue === 'error') {
      throw new Error(`Paylocity operation failed: ${JSON.stringify(status)}`);
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('Paylocity operation timed out');
}

/**
 * Raw punch segment from Paylocity API
 */
export interface PunchSegment {
  punchID: string;
  origin: string;  // 'Mobile', 'Web', etc.
  date: string;
  punchType: string;  // 'work', 'meal', etc.
  relativeStart: string;  // Clock-in time
  relativeEnd: string | null;  // Clock-out time (null if still clocked in)
  relativeOriginalStart?: string;
  relativeOriginalEnd?: string;
  durationHours: number | null;
  earnings?: number;
  costCenters?: Array<{
    id: string;
    costCenterId: number;
    level: number;
    code: string;
    name: string;
    isActive: boolean;
  }>;
}

/**
 * Raw employee punch record from Paylocity API
 */
export interface PaylocityPunchRecord {
  employeeId: string;
  companyId: string;
  badgeNumber?: number;
  relativeStart: string;
  relativeEnd: string | null;
  segments: PunchSegment[];
}

/**
 * Normalized punch record for our application
 */
export interface PunchRecord {
  punchId: string;
  employeeId: string;
  punchDate: string;
  clockInTime: string | null;
  clockOutTime: string | null;
  durationHours: number | null;
  origin: string;
  punchType: string;
  costCenterCode?: string;
  costCenterName?: string;
}

/**
 * Get punch details for all employees in a date range
 * Uses the 3-step async process for company-level data
 */
export async function getCompanyPunchDetails(
  startDate: string,
  endDate: string
): Promise<PunchRecord[]> {
  console.log(`Fetching Paylocity punch data: ${startDate} to ${endDate}`);

  // Step 1: Create punch detail operation
  const createResponse = await paylocityFetch(
    `/apiHub/time/v2/companies/${PAYLOCITY_CONFIG.companyId}/punchdetails`,
    {
      method: 'POST',
      body: JSON.stringify({
        relativeStart: startDate,
        relativeEnd: endDate,
      }),
    }
  );

  if (!createResponse.operationId) {
    throw new Error('No operationId returned from punch details request');
  }

  console.log(`  Operation ID: ${createResponse.operationId}`);

  // Step 2: Wait for operation to complete
  const resourceId = await waitForOperation(createResponse.operationId);
  console.log(`  Resource ID: ${resourceId}`);

  // Step 3: Fetch the punch details
  const rawRecords: PaylocityPunchRecord[] = [];
  let hasMore = true;
  let offset = 0;
  const limit = 100;

  while (hasMore) {
    const data = await paylocityFetch(
      `/apiHub/time/v2/companies/${PAYLOCITY_CONFIG.companyId}/PunchDetails/${resourceId}?includetotalcount=true&limit=${limit}&offset=${offset}`
    );

    // Response is an array-like object with numeric keys, convert to array
    const records: PaylocityPunchRecord[] = [];
    if (data && typeof data === 'object') {
      const keys = Object.keys(data).filter(k => !isNaN(Number(k)));
      keys.forEach(k => {
        if (data[k]) records.push(data[k]);
      });
    }

    rawRecords.push(...records);
    hasMore = records.length === limit;
    offset += limit;
  }

  // Normalize the records - flatten segments into individual punch records
  const results: PunchRecord[] = [];
  for (const record of rawRecords) {
    for (const segment of record.segments || []) {
      results.push({
        punchId: segment.punchID,
        employeeId: record.employeeId,
        punchDate: segment.date,
        clockInTime: segment.relativeStart || null,
        clockOutTime: segment.relativeEnd || null,
        durationHours: segment.durationHours,
        origin: segment.origin,
        punchType: segment.punchType,
        costCenterCode: segment.costCenters?.[0]?.code,
        costCenterName: segment.costCenters?.[0]?.name,
      });
    }
  }

  console.log(`  Retrieved ${results.length} punch records from ${rawRecords.length} employees`);
  return results;
}

/**
 * Get raw punch data for all employees (preserves original structure)
 */
export async function getRawCompanyPunchDetails(
  startDate: string,
  endDate: string
): Promise<PaylocityPunchRecord[]> {
  console.log(`Fetching raw Paylocity punch data: ${startDate} to ${endDate}`);

  const createResponse = await paylocityFetch(
    `/apiHub/time/v2/companies/${PAYLOCITY_CONFIG.companyId}/punchdetails`,
    {
      method: 'POST',
      body: JSON.stringify({
        relativeStart: startDate,
        relativeEnd: endDate,
      }),
    }
  );

  if (!createResponse.operationId) {
    throw new Error('No operationId returned');
  }

  const resourceId = await waitForOperation(createResponse.operationId);

  const rawRecords: PaylocityPunchRecord[] = [];
  let hasMore = true;
  let offset = 0;
  const limit = 100;

  while (hasMore) {
    const data = await paylocityFetch(
      `/apiHub/time/v2/companies/${PAYLOCITY_CONFIG.companyId}/PunchDetails/${resourceId}?includetotalcount=true&limit=${limit}&offset=${offset}`
    );

    const records: PaylocityPunchRecord[] = [];
    if (data && typeof data === 'object') {
      const keys = Object.keys(data).filter(k => !isNaN(Number(k)));
      keys.forEach(k => {
        if (data[k]) records.push(data[k]);
      });
    }

    rawRecords.push(...records);
    hasMore = records.length === limit;
    offset += limit;
  }

  console.log(`  Retrieved ${rawRecords.length} employee punch records`);
  return rawRecords;
}

/**
 * Paylocity employee from coreHr endpoint
 */
export interface PaylocityEmployee {
  id: string;  // This is the employeeId used in punch data
  companyId: string;
  relationshipId?: string;
  lastName: string;
  displayName?: string;  // First name or preferred name
  firstName?: string;
  status: string;  // 'Active', 'Terminated', etc.
  statusType: string;  // 'A' for active, 'T' for terminated
}

/**
 * Get all employees from Paylocity (handles pagination)
 */
export async function getEmployees(): Promise<PaylocityEmployee[]> {
  const allEmployees: PaylocityEmployee[] = [];
  let nextToken: string | null = null;

  do {
    const url = nextToken
      ? `/coreHr/v1/companies/${PAYLOCITY_CONFIG.companyId}/employees?nextToken=${encodeURIComponent(nextToken)}`
      : `/coreHr/v1/companies/${PAYLOCITY_CONFIG.companyId}/employees`;

    const data = await paylocityFetch(url);
    const employees = data.employees || [];
    allEmployees.push(...employees);

    nextToken = data.nextToken || null;
  } while (nextToken);

  console.log(`  Fetched ${allEmployees.length} Paylocity employees`);
  return allEmployees;
}

/**
 * Get active employees only
 */
export async function getActiveEmployees(): Promise<PaylocityEmployee[]> {
  const employees = await getEmployees();
  return employees.filter(e => e.statusType === 'A' || e.status === 'Active');
}

/**
 * Test Paylocity API connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    await getToken();
    console.log('Paylocity API connection successful');
    return true;
  } catch (error) {
    console.error('Paylocity API connection failed:', error);
    return false;
  }
}
