// Test script to check Paylocity API data for a specific date
require('dotenv').config({ path: '.env.local' });

const PAYLOCITY_CONFIG = {
  clientId: process.env.PAYLOCITY_NG_CLIENT_ID || '',
  clientSecret: process.env.PAYLOCITY_NG_CLIENT_SECRET || '',
  companyId: process.env.PAYLOCITY_COMPANY_ID || '',
  authUrl: process.env.PAYLOCITY_NG_AUTH_URL || 'https://dc1prodgwext.paylocity.com/public/security/v1/token',
  baseUrl: 'https://dc1prodgwext.paylocity.com',
};

let cachedToken = null;

async function getToken() {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
    return cachedToken.token;
  }

  const params = new URLSearchParams();
  params.append('client_id', PAYLOCITY_CONFIG.clientId);
  params.append('client_secret', PAYLOCITY_CONFIG.clientSecret);
  params.append('grant_type', 'client_credentials');

  const response = await fetch(PAYLOCITY_CONFIG.authUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Paylocity auth failed: ${response.status} - ${text}`);
  }

  const data = await response.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000),
  };
  return cachedToken.token;
}

async function paylocityFetch(path, options = {}) {
  const token = await getToken();
  const response = await fetch(`${PAYLOCITY_CONFIG.baseUrl}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (response.status === 202) {
    const location = response.headers.get('Location');
    const operationId = location ? location.split('/').pop() : null;
    return { location, operationId, status: 202 };
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Paylocity API error: ${response.status} - ${text}`);
  }

  return response.json();
}

async function waitForOperation(operationId, maxWaitMs = 60000) {
  const startTime = Date.now();
  const pollInterval = 1000;

  while (Date.now() - startTime < maxWaitMs) {
    const status = await paylocityFetch(
      `/apiHub/time/v2/companies/${PAYLOCITY_CONFIG.companyId}/PunchDetailOperations/${operationId}`
    );

    const statusValue = status.status?.toLowerCase() || '';
    if (statusValue === 'complete' || statusValue === 'completed' || statusValue === 'succeeded') {
      let resourceId = status.resourceId || status.ResourceId;
      if (!resourceId && status.location) {
        resourceId = status.location.split('/').pop();
      }
      return resourceId || operationId;
    }

    if (statusValue === 'failed' || statusValue === 'error') {
      throw new Error(`Paylocity operation failed: ${JSON.stringify(status)}`);
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('Paylocity operation timed out');
}

async function getCompanyPunchDetails(startDate, endDate) {
  console.log(`Fetching Paylocity punch data: ${startDate} to ${endDate}`);

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

  const resourceId = await waitForOperation(createResponse.operationId);
  console.log(`  Resource ID: ${resourceId}`);

  const rawRecords = [];
  let hasMore = true;
  let offset = 0;
  const limit = 100;

  while (hasMore) {
    const data = await paylocityFetch(
      `/apiHub/time/v2/companies/${PAYLOCITY_CONFIG.companyId}/PunchDetails/${resourceId}?includetotalcount=true&limit=${limit}&offset=${offset}`
    );

    const records = [];
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

  // Normalize
  const results = [];
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

async function main() {
  const testDate = process.argv[2] || '2025-12-16';
  console.log(`\n=== TESTING PAYLOCITY FOR ${testDate} ===\n`);

  try {
    const punches = await getCompanyPunchDetails(
      `${testDate}T00:00:00`,
      `${testDate}T23:59:59`
    );

    console.log(`\nTotal punches returned: ${punches.length}`);

    // Find Andrew's punch (employee ID 10021)
    const andrewPunches = punches.filter(p => p.employeeId === '10021');
    console.log(`\n=== ANDREW DUNCAN (10021) PUNCHES ===`);
    console.log(`Count: ${andrewPunches.length}`);
    if (andrewPunches.length) {
      console.log(JSON.stringify(andrewPunches, null, 2));
    } else {
      console.log('NO PUNCHES FOUND FOR ANDREW!');
    }

    // Show all unique employee IDs
    const employeeIds = [...new Set(punches.map(p => p.employeeId))];
    console.log(`\n=== EMPLOYEES WITH PUNCHES ===`);
    console.log(`Count: ${employeeIds.length}`);
    console.log(employeeIds.join(', '));

  } catch (error) {
    console.error('Error:', error);
  }
}

main();
