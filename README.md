# Tech Truth

A business intelligence application for tracking technician arrival times and identifying discrepancies between scheduled job times (from Service Titan) and actual GPS arrival times (from Verizon Connect).

## Purpose

Tech Truth helps identify:
- **Late arrivals to first jobs** - Technicians arriving after their scheduled start time
- **Time card abuse** - Potential cases where technicians clock in before arriving at their first job location
- **Arrival patterns** - Historical data on technician punctuality

## Tech Stack

- **Frontend**: Next.js 14 with TypeScript, Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **GPS Data**: Verizon Connect (Fleetmatics) API
- **Job Data**: Service Titan API
- **Hosting**: Netlify

## Features

- Real-time dashboard showing arrival discrepancies
- Filter by date and first-job-only
- Technician performance summary
- Mark discrepancies as reviewed
- Real-time updates via Supabase subscriptions

## Setup

### 1. Environment Variables

Create a `.env.local` file with the following:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Service Titan
ST_BASE_URL=https://api.servicetitan.io
ST_AUTH_URL=https://auth.servicetitan.io/connect/token
ST_TENANT_ID=your_tenant_id
ST_APPLICATION_KEY=your_app_key
ST_CLIENT_ID=your_client_id
ST_CLIENT_SECRET=your_client_secret

# Verizon Connect
VERIZON_USERNAME=your_username
VERIZON_PASSWORD=your_password
VERIZON_API_URL=https://fim.api.us.fleetmatics.com
```

### 2. Database Setup

Run the SQL migration in `database/001_initial_schema.sql` in your Supabase SQL editor.

### 3. Install Dependencies

```bash
npm install
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

## API Endpoints

- `GET /api/discrepancies` - Get arrival discrepancies
- `PATCH /api/discrepancies` - Update discrepancy (mark reviewed, add notes)
- `GET /api/technicians` - Get technicians with optional performance data
- `POST /api/sync-data` - Sync data from Service Titan and Verizon Connect
- `GET /api/service-titan/technicians` - Get technicians from Service Titan
- `GET /api/service-titan/appointments` - Get appointments for a date
- `GET /api/verizon/vehicles` - Get vehicles from Verizon Connect
- `GET /api/verizon/locations` - Get vehicle locations

## Deployment

This project is configured for Netlify deployment. Connect your GitHub repository to Netlify and set the environment variables in your Netlify site settings.
