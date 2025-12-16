// Test Paylocity API connection and punch data retrieval
require('dotenv').config({ path: '.env.local' });

const PAYLOCITY_CONFIG = {
  clientId: process.env.PAYLOCITY_NG_CLIENT_ID || '',
  clientSecret: process.env.PAYLOCITY_NG_CLIENT_SECRET || '',
  companyId: process.env.PAYLOCITY_COMPANY_ID || '',
  authUrl: process.env.PAYLOCITY_NG_AUTH_URL || 'https://dc1prodgwext.paylocity.com/public/security/v1/token',
  baseUrl: 'https://dc1prodgwext.paylocity.com',
};

console.log('Paylocity Config:');
console.log('  Client ID:', PAYLOCITY_CONFIG.clientId ? `${PAYLOCITY_CONFIG.clientId.slice(0, 8)}...` : 'MISSING');
console.log('  Company ID:', PAYLOCITY_CONFIG.companyId || 'MISSING');
console.log('');

async function getToken() {
  console.log('Getting auth token...');

  const params = new URLSearchParams();
  params.append('client_id', PAYLOCITY_CONFIG.clientId);
  params.append('client_secret', PAYLOCITY_CONFIG.clientSecret);
  params.append('grant_type', 'client_credentials');

  const response = await fetch(PAYLOCITY_CONFIG.authUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Auth failed: ${response.status} - ${text}`);
  }

  const data = await response.json();
  console.log('  Token obtained!');
  return data.access_token;
}

async function paylocityFetch(token, path, options = {}) {
  const url = `${PAYLOCITY_CONFIG.baseUrl}${path}`;
  console.log(`  ${options.method || 'GET'}: ${url}`);

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  // Handle async operations (202)
  if (response.status === 202) {
    const location = response.headers.get('Location');
    // Extract operation ID from location URL
    const operationId = location ? location.split('/').pop() : null;
    console.log('  Async operation started:', operationId);
    return { location, operationId, status: 202 };
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error: ${response.status} - ${text.substring(0, 200)}`);
  }

  return response.json();
}

async function getEmployees(token) {
  console.log('\n--- Fetching Employees ---');
  const data = await paylocityFetch(token, `/coreHr/v1/companies/${PAYLOCITY_CONFIG.companyId}/employees`);

  // Log the response structure
  console.log('  Response keys:', Object.keys(data));

  const employees = data.employees || data.data || [];
  console.log(`  Found ${employees.length} employees`);

  // Show actual structure of first employee
  if (employees.length > 0) {
    console.log('  First employee structure:', JSON.stringify(employees[0], null, 2));
  }

  return employees;
}

async function waitForOperation(token, operationId, maxWaitMs = 60000) {
  const startTime = Date.now();
  const pollInterval = 1000;

  console.log('  Waiting for operation to complete...');

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const status = await paylocityFetch(
        token,
        `/apiHub/time/v2/companies/${PAYLOCITY_CONFIG.companyId}/PunchDetailOperations/${operationId}`
      );

      const statusValue = status.status?.toLowerCase() || '';
      console.log(`    Status: ${status.status}`);
      console.log(`    Full response:`, JSON.stringify(status, null, 2));

      // Check for various "complete" statuses
      if (statusValue === 'complete' || statusValue === 'completed' || statusValue === 'succeeded') {
        // Resource ID is in the location URL
        let resId = status.resourceId || status.ResourceId;
        if (!resId && status.location) {
          // Extract from URL like: .../PunchDetails/c29a600a-e106-496f-93c9-80a52a0eecbb
          resId = status.location.split('/').pop();
        }
        console.log('  Operation completed! Resource ID:', resId);
        return resId || operationId;
      }

      if (statusValue === 'failed' || statusValue === 'error') {
        throw new Error(`Operation failed: ${JSON.stringify(status)}`);
      }
    } catch (err) {
      if (err.message.includes('Operation failed')) throw err;
      // Log but continue polling
      console.log(`    Poll error: ${err.message.substring(0, 50)}`);
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('Operation timed out');
}

async function fetchPunchDetails(token, resourceId) {
  const results = [];
  let hasMore = true;
  let offset = 0;
  const limit = 100;

  console.log('\n--- Fetching Punch Details ---');

  while (hasMore) {
    const data = await paylocityFetch(
      token,
      `/apiHub/time/v2/companies/${PAYLOCITY_CONFIG.companyId}/PunchDetails/${resourceId}?includetotalcount=true&limit=${limit}&offset=${offset}`
    );

    console.log('  Response keys:', Object.keys(data));

    if (data.data && Array.isArray(data.data)) {
      results.push(...data.data);
      console.log(`  Fetched ${data.data.length} records (total: ${results.length})`);
    } else if (Array.isArray(data)) {
      results.push(...data);
      console.log(`  Fetched ${data.length} records (total: ${results.length})`);
      hasMore = false;
    } else {
      console.log('  Response:', JSON.stringify(data, null, 2).substring(0, 500));
      hasMore = false;
    }

    if (data.data) {
      hasMore = data.data.length === limit;
    }
    offset += limit;
  }

  return results;
}

async function getPunchData(token, startDate, endDate) {
  console.log(`\n--- Creating Punch Detail Operation ---`);
  console.log(`  Date range: ${startDate} to ${endDate}`);

  // Step 1: Create the async operation
  const createResponse = await paylocityFetch(
    token,
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

  // Step 2: Wait for operation to complete
  const resourceId = await waitForOperation(token, createResponse.operationId);

  console.log(`  Using resourceId: ${resourceId}`);

  // Step 3: Fetch the punch details
  const punches = await fetchPunchDetails(token, resourceId);

  return punches;
}

async function main() {
  try {
    const token = await getToken();
    console.log('Auth successful!');

    // Get employees
    const employees = await getEmployees(token);

    // Create lookup map by employee ID - check for various property names
    const empMap = {};
    employees.forEach(e => {
      const id = e.employeeId || e.id || e.EmployeeId || e.employeeID;
      const firstName = e.firstName || e.FirstName || e.givenName || e.name?.first || '';
      const lastName = e.lastName || e.LastName || e.familyName || e.name?.last || '';
      if (id) {
        empMap[id] = `${firstName} ${lastName}`.trim() || `Employee ${id}`;
      }
    });

    // Try today's punch data
    const today = new Date();
    let startDate = today.toISOString().split('T')[0] + 'T00:00:00';
    let endDate = today.toISOString().split('T')[0] + 'T23:59:59';

    let punches = await getPunchData(token, startDate, endDate);

    // If no punches today, try last few days
    if (punches.length === 0) {
      console.log('\n  No punch records today, trying last 5 days...');

      const fiveDaysAgo = new Date(today);
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
      startDate = fiveDaysAgo.toISOString().split('T')[0] + 'T00:00:00';

      punches = await getPunchData(token, startDate, endDate);
    }

    console.log(`\n--- Results ---`);
    console.log(`Total punch records: ${punches.length}`);

    if (punches.length > 0) {
      // Show sample record structure
      console.log('\nSample punch record structure:');
      console.log(JSON.stringify(punches[0], null, 2));

      // Parse the data - each record has segments with start/end times
      console.log('\n--- Punches by Employee ---');

      punches.forEach(record => {
        const empId = record.employeeId;
        const name = empMap[empId] || `Employee ${empId}`;
        const segments = record.segments || [];

        if (segments.length === 0) return;

        console.log(`\n${name} (ID: ${empId}):`);

        segments.forEach(seg => {
          const date = seg.date;
          const clockIn = seg.relativeStart;
          const clockOut = seg.relativeEnd;
          const duration = seg.durationHours;
          const origin = seg.origin;
          const punchType = seg.punchType;
          const costCenter = seg.costCenters?.[0]?.name || 'N/A';

          // Format times
          const inTime = clockIn ? new Date(clockIn).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'N/A';
          const outTime = clockOut ? new Date(clockOut).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'N/A';

          console.log(`  ${date}:`);
          console.log(`    Clock In:  ${inTime} (${origin})`);
          console.log(`    Clock Out: ${outTime}`);
          console.log(`    Duration:  ${duration?.toFixed(2) || 'N/A'} hours`);
          console.log(`    Type:      ${punchType}`);
          console.log(`    Dept:      ${costCenter}`);
        });
      });

      // Show summary stats
      console.log('\n--- Summary ---');
      console.log(`  Total employees with punches: ${punches.length}`);

      const allSegments = punches.flatMap(p => p.segments || []);
      console.log(`  Total punch segments: ${allSegments.length}`);

      const origins = [...new Set(allSegments.map(s => s.origin))];
      console.log(`  Punch origins: ${origins.join(', ')}`);

      const punchTypes = [...new Set(allSegments.map(s => s.punchType))];
      console.log(`  Punch types: ${punchTypes.join(', ')}`);
    }

  } catch (error) {
    console.error('\nError:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

main();
