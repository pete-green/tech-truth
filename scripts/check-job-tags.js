// Check ServiceTitan job details for tags
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
  const response = await fetch(url, {
    headers: {
      Authorization: 'Bearer ' + token,
      'ST-App-Key': ST_CONFIG.applicationKey,
      Accept: 'application/json',
    },
  });
  return response.json();
}

async function main() {
  const jobId = 176041121;

  console.log('Fetching ServiceTitan details for job ' + jobId + '...\n');

  const token = await getToken();

  // Get job details
  const job = await stFetch('/jpm/v2/tenant/' + ST_CONFIG.tenantId + '/jobs/' + jobId, token);

  console.log('=== JOB DETAILS ===');
  console.log(JSON.stringify(job, null, 2));

  // Try to get job tags endpoint if it exists
  try {
    const tags = await stFetch('/jpm/v2/tenant/' + ST_CONFIG.tenantId + '/jobs/' + jobId + '/tags', token);
    console.log('\n=== JOB TAGS ===');
    console.log(JSON.stringify(tags, null, 2));
  } catch (e) {
    console.log('\nNo separate tags endpoint or error:', e.message);
  }

  // Get job type details if there's a jobTypeId
  if (job.jobTypeId) {
    try {
      const jobType = await stFetch('/jpm/v2/tenant/' + ST_CONFIG.tenantId + '/job-types/' + job.jobTypeId, token);
      console.log('\n=== JOB TYPE ===');
      console.log(JSON.stringify(jobType, null, 2));
    } catch (e) {
      console.log('\nCould not fetch job type:', e.message);
    }
  }
}

main().catch(console.error);
