// Location logos and category icons for custom locations

import { LocationCategory } from '@/types/custom-location';

// Category icons using emojis (fallback for when no logo is set)
export const CATEGORY_ICONS: Record<LocationCategory, string> = {
  gas_station: '⛽',
  supply_house: '🔧',
  restaurant: '🍔',
  parts_store: '🏭',
  other: '📍',
};

// Category colors for UI styling
export const CATEGORY_COLORS: Record<LocationCategory, { bg: string; border: string; text: string }> = {
  gas_station: {
    bg: 'bg-red-50',
    border: 'border-red-300',
    text: 'text-red-800',
  },
  supply_house: {
    bg: 'bg-blue-50',
    border: 'border-blue-300',
    text: 'text-blue-800',
  },
  restaurant: {
    bg: 'bg-orange-50',
    border: 'border-orange-300',
    text: 'text-orange-800',
  },
  parts_store: {
    bg: 'bg-purple-50',
    border: 'border-purple-300',
    text: 'text-purple-800',
  },
  other: {
    bg: 'bg-gray-50',
    border: 'border-gray-300',
    text: 'text-gray-800',
  },
};

// Common location presets with their logos
// These can be selected when labeling a new location
export interface LocationPreset {
  name: string;
  category: LocationCategory;
  logoUrl?: string;
}

export const LOCATION_PRESETS: LocationPreset[] = [
  // Gas Stations
  { name: 'Sheetz', category: 'gas_station', logoUrl: 'https://logo.clearbit.com/sheetz.com' },
  { name: 'BP', category: 'gas_station', logoUrl: 'https://logo.clearbit.com/bp.com' },
  { name: 'Shell', category: 'gas_station', logoUrl: 'https://logo.clearbit.com/shell.com' },
  { name: 'Exxon', category: 'gas_station', logoUrl: 'https://logo.clearbit.com/exxonmobil.com' },
  { name: 'Speedway', category: 'gas_station', logoUrl: 'https://logo.clearbit.com/speedway.com' },
  { name: 'Circle K', category: 'gas_station', logoUrl: 'https://logo.clearbit.com/circlek.com' },
  { name: "QuikTrip", category: 'gas_station', logoUrl: 'https://logo.clearbit.com/quiktrip.com' },

  // Supply Houses
  { name: 'Ferguson', category: 'supply_house', logoUrl: 'https://logo.clearbit.com/ferguson.com' },
  { name: 'Johnstone Supply', category: 'supply_house', logoUrl: 'https://logo.clearbit.com/johnstonesupply.com' },
  { name: "Carrier Enterprise", category: 'supply_house', logoUrl: 'https://logo.clearbit.com/carrierenterprise.com' },
  { name: 'Winsupply', category: 'supply_house', logoUrl: 'https://logo.clearbit.com/winsupply.com' },
  { name: 'RE Michel', category: 'supply_house', logoUrl: 'https://logo.clearbit.com/remichel.com' },
  { name: 'Lennox', category: 'supply_house', logoUrl: 'https://logo.clearbit.com/lennox.com' },

  // Parts Stores
  { name: 'Home Depot', category: 'parts_store', logoUrl: 'https://logo.clearbit.com/homedepot.com' },
  { name: "Lowe's", category: 'parts_store', logoUrl: 'https://logo.clearbit.com/lowes.com' },
  { name: 'AutoZone', category: 'parts_store', logoUrl: 'https://logo.clearbit.com/autozone.com' },
  { name: 'Advance Auto Parts', category: 'parts_store', logoUrl: 'https://logo.clearbit.com/advanceautoparts.com' },
  { name: "O'Reilly Auto Parts", category: 'parts_store', logoUrl: 'https://logo.clearbit.com/oreillyauto.com' },
  { name: 'Fastenal', category: 'parts_store', logoUrl: 'https://logo.clearbit.com/fastenal.com' },
  { name: 'Grainger', category: 'parts_store', logoUrl: 'https://logo.clearbit.com/grainger.com' },

  // Restaurants
  { name: "McDonald's", category: 'restaurant', logoUrl: 'https://logo.clearbit.com/mcdonalds.com' },
  { name: "Chick-fil-A", category: 'restaurant', logoUrl: 'https://logo.clearbit.com/chick-fil-a.com' },
  { name: "Wendy's", category: 'restaurant', logoUrl: 'https://logo.clearbit.com/wendys.com' },
  { name: 'Subway', category: 'restaurant', logoUrl: 'https://logo.clearbit.com/subway.com' },
  { name: 'Cookout', category: 'restaurant' }, // Local chain, may not have clearbit logo
  { name: "Bojangles'", category: 'restaurant', logoUrl: 'https://logo.clearbit.com/bojangles.com' },
  { name: 'Starbucks', category: 'restaurant', logoUrl: 'https://logo.clearbit.com/starbucks.com' },
  { name: 'Dunkin', category: 'restaurant', logoUrl: 'https://logo.clearbit.com/dunkindonuts.com' },
];

// Get a preset by name (case-insensitive)
export function findPresetByName(name: string): LocationPreset | undefined {
  const normalizedName = name.toLowerCase().trim();
  return LOCATION_PRESETS.find(preset =>
    preset.name.toLowerCase() === normalizedName
  );
}

// Get all presets for a category
export function getPresetsByCategory(category: LocationCategory): LocationPreset[] {
  return LOCATION_PRESETS.filter(preset => preset.category === category);
}

// Get the icon for a category
export function getCategoryIcon(category: LocationCategory | string | undefined): string {
  if (!category) return CATEGORY_ICONS.other;
  return CATEGORY_ICONS[category as LocationCategory] || CATEGORY_ICONS.other;
}

// Get the colors for a category
export function getCategoryColors(category: LocationCategory | string | undefined) {
  if (!category) return CATEGORY_COLORS.other;
  return CATEGORY_COLORS[category as LocationCategory] || CATEGORY_COLORS.other;
}
