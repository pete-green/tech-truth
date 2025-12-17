import { NextResponse } from 'next/server';

/**
 * Debug endpoint to check environment variable status
 * Does NOT expose actual values, just checks if they're set
 */
export async function GET() {
  const envCheck = {
    // Supabase
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,

    // Service Titan
    ST_BASE_URL: !!process.env.ST_BASE_URL,
    ST_AUTH_URL: !!process.env.ST_AUTH_URL,
    ST_TENANT_ID: !!process.env.ST_TENANT_ID,
    ST_APPLICATION_KEY: !!process.env.ST_APPLICATION_KEY,
    ST_CLIENT_ID: !!process.env.ST_CLIENT_ID,
    ST_CLIENT_SECRET: !!process.env.ST_CLIENT_SECRET,

    // Verizon Connect
    VERIZON_API_URL: !!process.env.VERIZON_API_URL,
    VERIZON_USERNAME: !!process.env.VERIZON_USERNAME,
    VERIZON_PASSWORD: !!process.env.VERIZON_PASSWORD,

    // Paylocity
    PAYLOCITY_NG_CLIENT_ID: !!process.env.PAYLOCITY_NG_CLIENT_ID,
    PAYLOCITY_NG_CLIENT_SECRET: !!process.env.PAYLOCITY_NG_CLIENT_SECRET,
    PAYLOCITY_COMPANY_ID: !!process.env.PAYLOCITY_COMPANY_ID,
    PAYLOCITY_NG_AUTH_URL: !!process.env.PAYLOCITY_NG_AUTH_URL,
  };

  // Get lengths for debugging (not actual values)
  const envLengths = {
    PAYLOCITY_NG_CLIENT_ID: process.env.PAYLOCITY_NG_CLIENT_ID?.length || 0,
    PAYLOCITY_NG_CLIENT_SECRET: process.env.PAYLOCITY_NG_CLIENT_SECRET?.length || 0,
    ST_CLIENT_ID: process.env.ST_CLIENT_ID?.length || 0,
    ST_CLIENT_SECRET: process.env.ST_CLIENT_SECRET?.length || 0,
    VERIZON_USERNAME: process.env.VERIZON_USERNAME?.length || 0,
    VERIZON_PASSWORD: process.env.VERIZON_PASSWORD?.length || 0,
  };

  // Count missing required vars
  const requiredVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ST_CLIENT_ID',
    'ST_CLIENT_SECRET',
    'VERIZON_USERNAME',
    'VERIZON_PASSWORD',
    'PAYLOCITY_NG_CLIENT_ID',
    'PAYLOCITY_NG_CLIENT_SECRET',
    'PAYLOCITY_COMPANY_ID',
  ];

  const missingVars = requiredVars.filter(v => !envCheck[v as keyof typeof envCheck]);

  return NextResponse.json({
    success: missingVars.length === 0,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    envCheck,
    envLengths,
    missingRequired: missingVars,
    summary: {
      totalChecked: Object.keys(envCheck).length,
      configured: Object.values(envCheck).filter(Boolean).length,
      missing: Object.values(envCheck).filter(v => !v).length,
    },
  });
}
