const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Paylocity config from env
const PAYLOCITY_CONFIG = {
  clientId: process.env.PAYLOCITY_NG_CLIENT_ID,
  clientSecret: process.env.PAYLOCITY_NG_CLIENT_SECRET,
  companyId: process.env.PAYLOCITY_COMPANY_ID,
  authUrl: 'https://dc1prodgwext.paylocity.com/public/security/v1/token',
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
    throw new Error(`Auth failed: ${response.status}`);
  }

  const data = await response.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000),
  };
  return cachedToken.token;
}

async function paylocityFetch(path) {
  const token = await getToken();
  const response = await fetch(`${PAYLOCITY_CONFIG.baseUrl}${path}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (response.status === 202) {
    const location = response.headers.get('Location');
    const operationId = location ? location.split('/').pop() : null;
    return { location, operationId, status: 202 };
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error: ${response.status} - ${text}`);
  }

  return response.json();
}

async function waitForOperation(operationId, maxWaitMs = 60000) {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    const status = await paylocityFetch(
      `/apiHub/time/v2/companies/${PAYLOCITY_CONFIG.companyId}/PunchDetailOperations/${operationId}`
    );
    const statusValue = (status.status || '').toLowerCase();
    if (statusValue === 'complete' || statusValue === 'completed' || statusValue === 'succeeded') {
      return status.resourceId || status.ResourceId || operationId;
    }
    if (statusValue === 'failed' || statusValue === 'error') {
      throw new Error(`Operation failed: ${JSON.stringify(status)}`);
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('Operation timed out');
}

async function getRawPunchData(startDate, endDate) {
  console.log(`Fetching Paylocity data: ${startDate} to ${endDate}`);

  const createResponse = await fetch(`${PAYLOCITY_CONFIG.baseUrl}/apiHub/time/v2/companies/${PAYLOCITY_CONFIG.companyId}/punchdetails`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${await getToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      relativeStart: startDate,
      relativeEnd: endDate,
    }),
  });

  if (createResponse.status === 202) {
    const location = createResponse.headers.get('Location');
    const operationId = location ? location.split('/').pop() : null;
    console.log(`  Operation ID: ${operationId}`);

    const resourceId = await waitForOperation(operationId);
    console.log(`  Resource ID: ${resourceId}`);

    const data = await paylocityFetch(
      `/apiHub/time/v2/companies/${PAYLOCITY_CONFIG.companyId}/PunchDetails/${resourceId}?includetotalcount=true&limit=100`
    );

    console.log('  Raw API response keys:', Object.keys(data));
    console.log('  Raw API response sample:', JSON.stringify(data).substring(0, 500));

    // Convert to array
    const records = [];
    if (data && typeof data === 'object') {
      Object.keys(data).filter(k => !isNaN(Number(k))).forEach(k => {
        if (data[k]) records.push(data[k]);
      });
    }
    console.log(`  Found ${records.length} records`);
    return records;
  }

  throw new Error(`Unexpected response: ${createResponse.status}`);
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Find Andrew Duncan's Paylocity ID
  const { data: tech } = await supabase
    .from('technicians')
    .select('id, name, paylocity_employee_id')
    .ilike('name', '%Andrew Duncan%')
    .single();

  console.log('Andrew Duncan:', tech);

  // Get raw Paylocity data for Dec 15
  const records = await getRawPunchData('2025-12-15T00:00:00', '2025-12-15T23:59:59');

  // Find Andrew's record
  const andrewRecord = records.find(r => r.employeeId === tech.paylocity_employee_id);

  if (andrewRecord) {
    console.log('\n=== Andrew\'s Raw Paylocity Data ===');
    console.log(JSON.stringify(andrewRecord, null, 2));
  } else {
    console.log('\nNo Paylocity record found for Andrew on Dec 15');
    console.log('Looking for employee ID:', tech.paylocity_employee_id);
    console.log('Available employee IDs:', records.map(r => r.employeeId).join(', '));
  }
}

main().catch(console.error);
