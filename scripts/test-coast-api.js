// Coast Fuel Card API Discovery Script
// Tests various endpoints to understand the API structure

require('dotenv').config({ path: '.env.local' });

const API_KEY = process.env.COAST_API_KEY;

if (!API_KEY) {
  console.error('ERROR: COAST_API_KEY not set in .env.local');
  process.exit(1);
}

// Base URL discovered: portal-api.coastpay.com
const BASE_URLS = [
  'https://portal-api.coastpay.com',
];

// Known endpoint patterns: /policy-v2/{policyId}/...
// Try various policy IDs
const ENDPOINTS = [];
for (let i = 1; i <= 20; i++) {
  ENDPOINTS.push(`/policy-v2/${i}/transactions`);
  ENDPOINTS.push(`/policy-v2/${i}/cards`);
}
// Also try larger IDs that might match account numbers
ENDPOINTS.push('/policy-v2/5113/transactions');  // From Verizon username
ENDPOINTS.push('/policy-v2/1144490/transactions');  // From Verizon username
ENDPOINTS.push('/policies');
ENDPOINTS.push('/api-keys');
ENDPOINTS.push('/user');

// Different auth methods to try
async function tryRequest(baseUrl, endpoint, authMethod, method = 'GET', body = null) {
  const url = baseUrl + endpoint;

  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };

  switch (authMethod) {
    case 'bearer':
      headers['Authorization'] = `Bearer ${API_KEY}`;
      break;
    case 'api-key':
      headers['X-API-Key'] = API_KEY;
      break;
    case 'api-key-lower':
      headers['x-api-key'] = API_KEY;
      break;
    case 'coast-api-key':
      headers['X-Coast-API-Key'] = API_KEY;
      break;
    case 'authorization-api':
      headers['Authorization'] = `Api-Key ${API_KEY}`;
      break;
    case 'raw-auth':
      headers['Authorization'] = API_KEY;
      break;
    case 'token':
      headers['Authorization'] = `Token ${API_KEY}`;
      break;
  }

  const options = {
    method,
    headers,
  };

  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);

    const status = response.status;
    let body = null;

    try {
      body = await response.text();
      // Try to parse as JSON
      try {
        body = JSON.parse(body);
      } catch (e) {
        // Keep as text
      }
    } catch (e) {
      body = '[Could not read body]';
    }

    return { url, authMethod, status, body };
  } catch (error) {
    return { url, authMethod, status: 'ERROR', body: error.message };
  }
}

async function main() {
  console.log('=== Coast API Discovery ===\n');
  console.log('API Key prefix:', API_KEY.substring(0, 20) + '...');
  console.log('API Key length:', API_KEY.length);

  // Analyze the key structure
  // Format appears to be: cak_[base64]==.[uuid]
  const parts = API_KEY.split('.');
  console.log('Key parts:', parts.length);
  if (parts.length >= 2) {
    console.log('UUID portion:', parts[parts.length - 1]);
  }
  console.log('\n');

  const authMethods = ['bearer', 'api-key', 'api-key-lower', 'coast-api-key', 'authorization-api', 'raw-auth', 'token'];

  // The /policy-v2/transactions endpoint needs a policyId parameter
  // Try to find policy IDs - they might be small integers
  // Also try the UUID from the API key as a potential ID

  const uuidFromKey = parts[parts.length - 1]; // ede4374e-b470-4e55-b24f-2b0d222a4f10

  // Known policy IDs from user's account:
  // Admin Policy: 127683
  // Default People Policy: 127684
  const POLICY_IDS = [127683, 127684];

  // Test POST requests to segment-api (since it said "malformed JSON")
  console.log('=== Testing POST requests to segment-api ===\n');

  const postTests = [
    // segment-api with empty body
    { url: 'https://segment-api.coastpay.com/v1/p', body: {} },
    // segment-api with writeKey (common segment.io pattern)
    { url: 'https://segment-api.coastpay.com/v1/p', body: { writeKey: API_KEY } },
    // segment-api with policyId
    { url: 'https://segment-api.coastpay.com/v1/p', body: { policyId: 127683 } },
    // Try identify/track patterns (Segment.io style)
    { url: 'https://segment-api.coastpay.com/v1/identify', body: { userId: 'test' } },
    { url: 'https://segment-api.coastpay.com/v1/track', body: { event: 'test' } },
  ];

  for (const test of postTests) {
    for (const auth of ['bearer', 'api-key']) {
      const result = await tryRequest(test.url, '', auth, 'POST', test.body);
      console.log(`[${result.status}] POST ${test.url} (${auth})`);
      if (result.body) {
        const preview = typeof result.body === 'string'
          ? result.body.substring(0, 200)
          : JSON.stringify(result.body).substring(0, 200);
        console.log('  Body sent:', JSON.stringify(test.body));
        console.log('  Response:', preview);
      }
    }
  }

  console.log('\n=== Testing GET requests ===\n');

  const quickTests = [
    // Try portal-api with actual policy IDs
    { base: 'https://portal-api.coastpay.com', endpoint: '/policy-v2/127683/transactions' },
    { base: 'https://portal-api.coastpay.com', endpoint: '/policy-v2/127684/transactions' },
  ];

  console.log('=== Quick Tests (trying common patterns) ===\n');

  for (const test of quickTests) {
    for (const auth of authMethods) {
      const result = await tryRequest(test.base, test.endpoint, auth);
      const statusColor = result.status === 200 ? '\x1b[32m' : result.status < 500 ? '\x1b[33m' : '\x1b[31m';
      const reset = '\x1b[0m';

      console.log(`${statusColor}[${result.status}]${reset} ${result.url} (${auth})`);

      // If we get a 200, show the response
      if (result.status === 200) {
        console.log('SUCCESS! Response:', JSON.stringify(result.body, null, 2).substring(0, 500));
        console.log('\n=== FOUND WORKING ENDPOINT ===');
        console.log('Base URL:', test.base);
        console.log('Endpoint:', test.endpoint);
        console.log('Auth Method:', auth);
        return;
      }

      // If we get 401/403, the endpoint exists but auth is wrong
      if (result.status === 401 || result.status === 403) {
        console.log('  Auth failed - endpoint may exist');
      }

      // If we get something other than connection error, show preview
      if (result.status !== 'ERROR' && result.status !== 404 && result.body) {
        const preview = typeof result.body === 'string'
          ? result.body.substring(0, 100)
          : JSON.stringify(result.body).substring(0, 100);
        console.log('  Response preview:', preview);
      }
    }
  }

  console.log('\n=== Expanded Tests (more endpoints) ===\n');

  // Try all combinations
  for (const baseUrl of BASE_URLS) {
    for (const endpoint of ENDPOINTS) {
      // Just try bearer first as most common
      const result = await tryRequest(baseUrl, endpoint, 'bearer');

      if (result.status !== 'ERROR' && result.status !== 404) {
        console.log(`[${result.status}] ${result.url}`);

        if (result.status === 200) {
          console.log('SUCCESS!', JSON.stringify(result.body, null, 2).substring(0, 500));
          return;
        }

        // Try other auth methods for non-404 responses
        if (result.status === 401 || result.status === 403) {
          for (const auth of authMethods.slice(1)) {
            const altResult = await tryRequest(baseUrl, endpoint, auth);
            console.log(`  [${altResult.status}] with ${auth}`);
            if (altResult.status === 200) {
              console.log('SUCCESS!', JSON.stringify(altResult.body, null, 2).substring(0, 500));
              return;
            }
          }
        }
      }
    }
  }

  console.log('\n=== No working endpoint found ===');
  console.log('The API may require:');
  console.log('- A different base URL');
  console.log('- A different authentication method');
  console.log('- Special headers or parameters');
  console.log('\nTry contacting Coast support for API documentation.');
}

main().catch(console.error);
