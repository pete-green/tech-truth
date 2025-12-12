# Coast Fuel Card Integration Plan

## Status: PAUSED - Awaiting API Documentation

**Last Updated:** December 12, 2024
**Contact:** Coast Integration Team (email sent requesting API access and documentation)

---

## Overview

### Business Goal
Track fuel purchases made by technicians during work hours (Monday-Friday, 8am-5pm Eastern) to identify time wasted getting gas when they should be on service calls.

### Why This Matters
- Technicians should get gas on their way to/from work, not during operating hours
- Fuel stops during work hours waste billable time
- Coast fuel cards can restrict purchases during work hours (requires manager approval)
- We want to track and report ALL work-hour fuel purchases regardless of approval status

---

## What We Discovered About Coast's API

### API Endpoints Found

| Domain | Purpose | Auth Required |
|--------|---------|---------------|
| `portal-api.coastpay.com` | Main API | AWS Cognito JWT tokens |
| `segment-api.coastpay.com` | Analytics/Tracking (Segment.io) | Write Key |

### Authentication Issue
The API key provided (`cak_...` format) does **not** work directly with the API. The `portal-api.coastpay.com` endpoint returned:

```
"None of the security schemes (ClientPortalCognitoAuth) successfully authenticated this request."
```

This means:
1. Coast uses **AWS Cognito** for authentication
2. The API key may need to be exchanged for a Cognito JWT token
3. Or the key is meant for a different authentication flow

### Known Policy IDs (from your account)
- **Admin Policy:** 127683
- **Default People Policy:** 127684

### API Key Details
```
Format: cak_[base64-encoded-data]==[uuid]
Example: cak_l78vhyTAgbFaoisO...==.ede4374e-b470-4e55-b24f-2b0d222a4f10

The UUID portion (ede4374e-b470-4e55-b24f-2b0d222a4f10) may be a key identifier.
```

### Environment Variable (already configured)
```bash
# In .env.local
COAST_API_KEY=cak_l78vhyTAgbFaoisOVIW/Feia6xljp8mWEBk/QIlL/aB/DlzmgeLrHHzaFhoQR8JLO7q95tK5LmnmhcOzZTLS0g==.ede4374e-b470-4e55-b24f-2b0d222a4f10
```

---

## Planned Implementation (Once API Access Works)

### Phase 1: Database Schema

Run this migration via Supabase:

```sql
-- Create fuel transactions table
CREATE TABLE fuel_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id UUID REFERENCES technicians(id) ON DELETE CASCADE,
  coast_transaction_id TEXT UNIQUE,  -- Coast's transaction ID for deduplication
  transaction_time TIMESTAMPTZ NOT NULL,
  merchant_name TEXT,
  merchant_address TEXT,
  merchant_latitude DECIMAL(10, 7),
  merchant_longitude DECIMAL(10, 7),
  amount_cents INTEGER,
  gallons DECIMAL(8, 3),
  is_work_hours BOOLEAN DEFAULT FALSE,  -- True if during Mon-Fri 8am-5pm ET
  time_at_station_minutes INTEGER,  -- Calculated from Verizon GPS data
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX idx_fuel_tx_tech_time ON fuel_transactions(technician_id, transaction_time);
CREATE INDEX idx_fuel_tx_work_hours ON fuel_transactions(is_work_hours) WHERE is_work_hours = TRUE;

-- Add Coast card ID mapping to technicians table
ALTER TABLE technicians ADD COLUMN coast_card_id TEXT;
```

### Phase 2: Coast API Client

Create `src/lib/coast-connect.ts`:

```typescript
import { toZonedTime } from 'date-fns-tz';

const COAST_CONFIG = {
  apiUrl: process.env.COAST_API_URL || 'https://portal-api.coastpay.com',
  apiKey: process.env.COAST_API_KEY || '',
};

export interface CoastTransaction {
  id: string;
  transactionTime: Date;
  merchantName: string;
  merchantAddress: string;
  latitude?: number;
  longitude?: number;
  amountCents: number;
  gallons?: number;
  cardId: string;  // Maps to technician via coast_card_id
}

// Authentication function - NEEDS COAST DOCUMENTATION
// May need to exchange API key for Cognito token
async function getAuthToken(): Promise<string> {
  // TODO: Implement based on Coast's auth documentation
  throw new Error('Coast authentication not yet implemented');
}

export async function getTransactions(
  startDate: Date,
  endDate: Date,
  policyId: number = 127683
): Promise<CoastTransaction[]> {
  const token = await getAuthToken();

  // TODO: Implement based on Coast's API documentation
  // Expected endpoint pattern: /policy-v2/{policyId}/transactions
  // With date range query params

  throw new Error('Coast API not yet implemented');
}

// Helper to determine if transaction is during work hours
export function isWorkHours(timestamp: Date): boolean {
  const eastern = toZonedTime(timestamp, 'America/New_York');
  const dayOfWeek = eastern.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const hour = eastern.getHours();

  // Monday (1) through Friday (5), 8am to 5pm
  return dayOfWeek >= 1 && dayOfWeek <= 5 && hour >= 8 && hour < 17;
}
```

### Phase 3: Time at Station Calculation

Use Verizon GPS data to calculate how long the truck was stopped at a gas station:

```typescript
// In src/lib/geo-utils.ts or coast-connect.ts

import { getVehicleSegments } from './verizon-connect';
import { calculateDistanceFeet } from './geo-utils';

export async function calculateTimeAtStation(
  vehicleId: string,
  transactionTime: Date,
  merchantLat: number,
  merchantLon: number
): Promise<number | null> {
  // Get GPS segments around the transaction time (±30 min window)
  const windowStart = new Date(transactionTime.getTime() - 30 * 60 * 1000);
  const windowEnd = new Date(transactionTime.getTime() + 30 * 60 * 1000);

  const segments = await getVehicleSegments(vehicleId, windowStart);

  // Find segment where truck stopped near the merchant location
  for (const segment of segments) {
    if (!segment.EndLocation || !segment.EndDateUtc) continue;

    const distanceFeet = calculateDistanceFeet(
      segment.EndLocation.Latitude,
      segment.EndLocation.Longitude,
      merchantLat,
      merchantLon
    );

    // If truck stopped within 500 feet of gas station
    if (distanceFeet <= 500) {
      const startTime = new Date(segment.StartDateUtc);
      const endTime = new Date(segment.EndDateUtc);
      const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
      return durationMinutes;
    }
  }

  return null; // Could not determine time at station
}
```

### Phase 4: Sync Process Updates

Add to `src/app/api/sync-data/route.ts`:

```typescript
import { getTransactions, isWorkHours, calculateTimeAtStation } from '@/lib/coast-connect';

// After existing GPS arrival detection code, add:

// Step: Sync fuel transactions
if (process.env.COAST_API_KEY) {
  console.log('Syncing fuel transactions from Coast...');

  try {
    const transactions = await getTransactions(startOfTargetDay, endOfTargetDay);

    for (const tx of transactions) {
      // Find technician by Coast card ID
      const { data: tech } = await supabase
        .from('technicians')
        .select('id, verizon_vehicle_id')
        .eq('coast_card_id', tx.cardId)
        .single();

      if (!tech) {
        console.log(`  No technician found for Coast card ${tx.cardId}`);
        continue;
      }

      // Calculate time at station using Verizon GPS
      let timeAtStationMinutes = null;
      if (tech.verizon_vehicle_id && tx.latitude && tx.longitude) {
        timeAtStationMinutes = await calculateTimeAtStation(
          tech.verizon_vehicle_id,
          tx.transactionTime,
          tx.latitude,
          tx.longitude
        );
      }

      // Upsert fuel transaction
      await supabase
        .from('fuel_transactions')
        .upsert({
          technician_id: tech.id,
          coast_transaction_id: tx.id,
          transaction_time: tx.transactionTime.toISOString(),
          merchant_name: tx.merchantName,
          merchant_address: tx.merchantAddress,
          merchant_latitude: tx.latitude,
          merchant_longitude: tx.longitude,
          amount_cents: tx.amountCents,
          gallons: tx.gallons,
          is_work_hours: isWorkHours(tx.transactionTime),
          time_at_station_minutes: timeAtStationMinutes,
        }, {
          onConflict: 'coast_transaction_id',
        });

      if (isWorkHours(tx.transactionTime)) {
        console.log(`  Work-hours fuel stop: ${tech.name} at ${tx.merchantName}`);
      }
    }
  } catch (error) {
    console.error('Error syncing fuel transactions:', error);
    errors.push({
      type: 'fuel_sync',
      error: error.message,
    });
  }
}
```

### Phase 5: Reports API Updates

Update `src/app/api/reports/technician-details/route.ts` to include fuel stops:

```typescript
// Add to the day detail query/response

interface FuelStop {
  transactionTime: string;
  merchantName: string;
  merchantAddress: string;
  latitude: number | null;
  longitude: number | null;
  amountCents: number;
  gallons: number | null;
  timeAtStationMinutes: number | null;
}

interface DayDetail {
  date: string;
  dayOfWeek: string;
  jobs: JobDetail[];
  fuelStops: FuelStop[];  // NEW
  summary: {
    totalJobs: number;
    firstJobLate: boolean;
    firstJobVariance: number | null;
    totalFuelStopMinutes: number;  // NEW
  };
}

// Query fuel transactions for the date range
const { data: fuelStops } = await supabase
  .from('fuel_transactions')
  .select('*')
  .eq('technician_id', technicianId)
  .eq('is_work_hours', true)  // Only work-hours stops
  .gte('transaction_time', startDate)
  .lte('transaction_time', endDate)
  .order('transaction_time', { ascending: true });

// Group by date and add to day details
```

### Phase 6: UI Components

Update `src/components/DayJobsTable.tsx`:

```tsx
// Add FuelStop interface
interface FuelStop {
  transactionTime: string;
  merchantName: string;
  merchantAddress: string;
  latitude: number | null;
  longitude: number | null;
  amountCents: number;
  gallons: number | null;
  timeAtStationMinutes: number | null;
}

// Add to props
interface DayJobsTableProps {
  date: string;
  dayOfWeek: string;
  jobs: JobDetail[];
  fuelStops?: FuelStop[];  // NEW
  onShowGpsLocation: (job: JobDetail) => void;
  onShowFuelLocation?: (stop: FuelStop) => void;  // NEW
}

// Add to component render, after job details:
{fuelStops && fuelStops.length > 0 && (
  <div className="mt-3 bg-orange-50 border border-orange-200 rounded-lg p-3">
    <div className="flex items-center gap-2 text-sm font-medium text-orange-700 mb-2">
      <span>⛽</span>
      <span>Work Hours Fuel Stop{fuelStops.length > 1 ? 's' : ''}</span>
    </div>
    {fuelStops.map((stop) => (
      <div key={stop.transactionTime} className="flex items-center justify-between text-sm py-1">
        <div>
          <span className="font-medium text-gray-900">
            {format(parseISO(stop.transactionTime), 'h:mm a')}
          </span>
          <span className="text-gray-600 ml-2">
            {stop.merchantName}
          </span>
          {stop.timeAtStationMinutes && (
            <span className="text-orange-600 ml-2">
              ({stop.timeAtStationMinutes} min)
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-gray-500">
            ${(stop.amountCents / 100).toFixed(2)}
            {stop.gallons && ` · ${stop.gallons.toFixed(1)} gal`}
          </span>
          {stop.latitude && stop.longitude && onShowFuelLocation && (
            <button
              onClick={() => onShowFuelLocation(stop)}
              className="text-blue-600 hover:text-blue-800"
              title="View location"
            >
              📍
            </button>
          )}
        </div>
      </div>
    ))}
  </div>
)}
```

### Phase 7: Settings Page - Card Mapping

Add to `src/app/settings/page.tsx`:

Allow mapping Coast card IDs to technicians so fuel transactions can be attributed to the correct person.

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/lib/coast-connect.ts` | CREATE | Coast API client |
| `src/app/api/sync-data/route.ts` | MODIFY | Add fuel transaction sync |
| `src/app/api/reports/technician-details/route.ts` | MODIFY | Include fuel stops in response |
| `src/components/DayJobsTable.tsx` | MODIFY | Display fuel stop info |
| `src/types/reports.ts` | MODIFY | Add FuelStop interface |
| `src/app/settings/page.tsx` | MODIFY | Add Coast card ID mapping |

---

## Questions to Ask Coast Support

When you receive API documentation from Coast, here are the key questions:

1. **Authentication**: How do we authenticate with the API using the `cak_...` API key?
   - Do we exchange it for a Cognito JWT token?
   - Is there a token endpoint?

2. **Transactions Endpoint**: What is the endpoint to fetch fuel transactions?
   - Expected: `/policy-v2/{policyId}/transactions` or similar
   - What query parameters for date range?

3. **Transaction Data**: What fields are returned for each transaction?
   - Transaction time (timezone?)
   - Merchant name and address
   - Merchant coordinates (lat/lon)?
   - Amount, gallons
   - Card ID (to map to technician)

4. **Card Information**: How do we get a list of cards and their IDs?
   - Need to map cards to technicians

5. **Rate Limits**: Any API rate limits we should respect?

---

## Test Script Location

A discovery script exists at `scripts/test-coast-api.js` that can be used to test endpoints once authentication is figured out. Run with:

```bash
node scripts/test-coast-api.js
```

---

## Related Documentation

- [Verizon Connect API](./VERIZON_API.md) - GPS data for time-at-station calculation
- [ServiceTitan API](./SERVICETITAN_API.md) - Technician and job data
- [Database Schema](../database/001_initial_schema.sql) - Current database structure
