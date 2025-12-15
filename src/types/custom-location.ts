// Custom location types for labeling unknown GPS stops

export type LocationCategory =
  | 'gas_station'
  | 'supply_house'
  | 'restaurant'
  | 'parts_store'
  | 'other';

export interface CustomLocation {
  id: string;
  name: string;
  category?: LocationCategory;
  logoUrl?: string;
  centerLatitude: number;
  centerLongitude: number;
  radiusFeet: number;
  address?: string;
  createdAt?: string;
  createdBy?: string;
}

// Database row format (snake_case)
export interface CustomLocationRow {
  id: string;
  name: string;
  category: string | null;
  logo_url: string | null;
  center_latitude: number;
  center_longitude: number;
  radius_feet: number;
  address: string | null;
  created_at: string;
  created_by: string | null;
}

// Convert database row to frontend type
export function rowToCustomLocation(row: CustomLocationRow): CustomLocation {
  return {
    id: row.id,
    name: row.name,
    category: row.category as LocationCategory | undefined,
    logoUrl: row.logo_url || undefined,
    centerLatitude: row.center_latitude,
    centerLongitude: row.center_longitude,
    radiusFeet: row.radius_feet,
    address: row.address || undefined,
    createdAt: row.created_at,
    createdBy: row.created_by || undefined,
  };
}

// Category display info
export const CATEGORY_INFO: Record<LocationCategory, { label: string; icon: string; color: string }> = {
  gas_station: { label: 'Gas Station', icon: '⛽', color: 'red' },
  supply_house: { label: 'Supply House', icon: '🔧', color: 'blue' },
  restaurant: { label: 'Restaurant', icon: '🍔', color: 'orange' },
  parts_store: { label: 'Parts Store', icon: '🏭', color: 'purple' },
  other: { label: 'Other', icon: '📍', color: 'gray' },
};
