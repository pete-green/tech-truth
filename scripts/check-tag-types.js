// Check ServiceTitan tag types - try different API paths
require('dotenv').config({ path: '.env.local' });

const ST_CONFIG = {
  baseUrl: process.env.ST_BASE_URL || 'https://api.servicetitan.io',
  authUrl: process.env.ST_AUTH_URL || 'https://auth.servicetitan.io/connect/token',
  tenantId: process.env.ST_TENANT_ID || '',
  applicationKey: process.env.ST_APPLICATION_KEY || '',
  clientId: process.env.ST_CLIENT_ID || '',
  clientSecret: process.env.ST_CLIENT_SECRET || '',
};

async function getToken() {
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: ST_CONFIG.clientId,
    client_secret: ST_CONFIG.clientSecret,
  });

  const response = await fetch(ST_CONFIG.authUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const tokenData = await response.json();
  return tokenData.access_token;
}

async function stFetch(endpoint, token) {
  const url = ST_CONFIG.baseUrl + endpoint;
  console.log('Trying: ' + url);
  const response = await fetch(url, {
    headers: {
      Authorization: 'Bearer ' + token,
      'ST-App-Key': ST_CONFIG.applicationKey,
      Accept: 'application/json',
    },
  });
  return { status: response.status, data: await response.json() };
}

async function main() {
  const tagIds = [18101797, 37190300, 95572803];
  const token = await getToken();

  // Try different API paths for tag-types
  const paths = [
    '/settings/v2/tenant/' + ST_CONFIG.tenantId + '/tag-types',
    '/jpm/v2/tenant/' + ST_CONFIG.tenantId + '/tag-types',
    '/crm/v2/tenant/' + ST_CONFIG.tenantId + '/tag-types',
    '/dispatch/v2/tenant/' + ST_CONFIG.tenantId + '/tag-types',
  ];

  for (const path of paths) {
    console.log('\n--- Trying path: ' + path + ' ---');
    const result = await stFetch(path + '?pageSize=500', token);

    if (result.status === 200 && result.data.data) {
      console.log('SUCCESS! Found ' + result.data.data.length + ' tags');

      // Find our specific tags
      for (const tag of result.data.data) {
        if (tagIds.includes(tag.id)) {
          console.log('  -> Tag ' + tag.id + ': "' + tag.name + '"');
        }
      }
      break;
    } else {
      console.log('Status: ' + result.status);
    }
  }
}

main().catch(console.error);
