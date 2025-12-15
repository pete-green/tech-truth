'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { X, MapPin, Tag, Save, Loader2 } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Circle, MapRecenter } from './LeafletMapWrapper';
import { LocationCategory, CATEGORY_INFO, CustomLocation } from '@/types/custom-location';
import { LOCATION_PRESETS, CATEGORY_ICONS, getCategoryColors, LocationPreset } from '@/lib/location-logos';

// Normalize name for deduplication (handles variations like "7-Eleven" vs "7 Eleven")
function normalizeNameKey(name: string): string {
  return name.toLowerCase().replace(/[-\s]+/g, '').trim();
}

// Extract unique location templates from saved locations
function extractUniqueTemplates(locations: CustomLocation[]): LocationPreset[] {
  const seen = new Map<string, LocationPreset>();

  for (const loc of locations) {
    const key = normalizeNameKey(loc.name);
    // Keep the one with the most complete data (has logo)
    if (!seen.has(key) || (loc.logoUrl && !seen.get(key)?.logoUrl)) {
      seen.set(key, {
        name: loc.name,
        category: (loc.category as LocationCategory) || 'other',
        logoUrl: loc.logoUrl,
      });
    }
  }

  return Array.from(seen.values());
}

interface LabelLocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  latitude: number;
  longitude: number;
  address: string;
  onSave: (data: {
    name: string;
    category: LocationCategory;
    logoUrl?: string;
    radiusFeet: number;
  }) => Promise<void>;
}

export default function LabelLocationModal({
  isOpen,
  onClose,
  latitude,
  longitude,
  address,
  onSave,
}: LabelLocationModalProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<LocationCategory>('other');
  const [logoUrl, setLogoUrl] = useState('');
  const [radiusFeet, setRadiusFeet] = useState(300);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const [icon, setIcon] = useState<any>(null);
  const [showPresets, setShowPresets] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState<LocationPreset[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load Leaflet icon on client side only
  useEffect(() => {
    import('leaflet').then((L) => {
      const MarkerIcon = new L.Icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      });
      setIcon(MarkerIcon);
    });
  }, []);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => setMapReady(true), 100);
      return () => clearTimeout(timer);
    } else {
      setMapReady(false);
      // Reset form when closing
      setName('');
      setCategory('other');
      setLogoUrl('');
      setRadiusFeet(300);
      setError('');
    }
  }, [isOpen]);

  // Fetch saved locations as templates when modal opens
  useEffect(() => {
    if (isOpen) {
      fetch('/api/custom-locations')
        .then(res => res.json())
        .then(data => {
          if (data.locations) {
            const templates = extractUniqueTemplates(data.locations);
            setSavedTemplates(templates);
          }
        })
        .catch(err => console.error('Failed to fetch saved locations:', err));
    }
  }, [isOpen]);

  // Combine hardcoded presets with saved templates, dedupe by normalized name
  const allPresets = useMemo(() => {
    const combined = new Map<string, LocationPreset>();

    // Add hardcoded presets first
    LOCATION_PRESETS.forEach(p => combined.set(normalizeNameKey(p.name), p));

    // Override/add saved templates (user data takes priority)
    savedTemplates.forEach(p => combined.set(normalizeNameKey(p.name), p));

    return Array.from(combined.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [savedTemplates]);

  // Filter presets based on what user has typed
  const filteredPresets = useMemo(() => {
    if (!name.trim()) return allPresets;

    const search = name.toLowerCase().trim();
    return allPresets.filter(p =>
      p.name.toLowerCase().includes(search)
    );
  }, [name, allPresets]);

  // Auto-close dropdown when no matches and user has typed something
  useEffect(() => {
    if (showPresets && filteredPresets.length === 0 && name.trim()) {
      setShowPresets(false);
    }
  }, [filteredPresets, showPresets, name]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowPresets(false);
      }
    };

    if (showPresets) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showPresets]);

  // Convert radius from feet to meters for Leaflet
  const radiusMeters = radiusFeet * 0.3048;

  const handlePresetSelect = (preset: typeof LOCATION_PRESETS[0]) => {
    setName(preset.name);
    setCategory(preset.category);
    if (preset.logoUrl) {
      setLogoUrl(preset.logoUrl);
    }
    setShowPresets(false);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Please enter a name for this location');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await onSave({
        name: name.trim(),
        category,
        logoUrl: logoUrl || undefined,
        radiusFeet,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save location');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const categories: LocationCategory[] = ['gas_station', 'supply_house', 'restaurant', 'parts_store', 'other'];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
          <div className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Label This Location</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-200 rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Address */}
          <div className="flex items-start gap-2 text-sm bg-gray-50 p-3 rounded-lg">
            <MapPin className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
            <span className="text-gray-700">{address}</span>
          </div>

          {/* Map */}
          <div className="h-48 rounded-lg overflow-hidden border border-gray-200">
            {mapReady && icon ? (
              <MapContainer
                center={[latitude, longitude]}
                zoom={17}
                className="h-full w-full"
              >
                <MapRecenter lat={latitude} lon={longitude} />
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker position={[latitude, longitude]} icon={icon} />
                <Circle
                  center={[latitude, longitude]}
                  radius={radiusMeters}
                  pathOptions={{
                    color: '#3b82f6',
                    fillColor: '#3b82f6',
                    fillOpacity: 0.2,
                  }}
                />
              </MapContainer>
            ) : (
              <div className="h-full flex items-center justify-center bg-gray-100">
                <span className="text-gray-500">Loading map...</span>
              </div>
            )}
          </div>

          {/* Radius Slider */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Geofence Radius: {radiusFeet} ft
            </label>
            <input
              type="range"
              min="100"
              max="1000"
              step="50"
              value={radiusFeet}
              onChange={(e) => setRadiusFeet(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>100 ft</span>
              <span>1000 ft</span>
            </div>
          </div>

          {/* Location Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Location Name
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!showPresets) setShowPresets(true);
                }}
                onFocus={() => setShowPresets(true)}
                placeholder="e.g., Sheetz, Ferguson Supply"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {showPresets && filteredPresets.length > 0 && (
                <div
                  ref={dropdownRef}
                  className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto"
                >
                  <div className="p-2 text-xs text-gray-500 border-b">
                    {name.trim() ? `Matching "${name}" (${filteredPresets.length})` : `Quick Select (${allPresets.length})`}
                  </div>
                  {filteredPresets.map((preset) => (
                    <button
                      key={preset.name}
                      onClick={() => handlePresetSelect(preset)}
                      className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-2"
                    >
                      {preset.logoUrl ? (
                        <img
                          src={preset.logoUrl}
                          alt={preset.name}
                          className="w-5 h-5 object-contain"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <span className="w-5 h-5 flex items-center justify-center">
                          {CATEGORY_ICONS[preset.category]}
                        </span>
                      )}
                      <span className="text-sm">{preset.name}</span>
                      <span className="text-xs text-gray-400 ml-auto">
                        {CATEGORY_INFO[preset.category]?.label}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Category Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Category
            </label>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => {
                const colors = getCategoryColors(cat);
                const isSelected = category === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                      isSelected
                        ? `${colors.bg} ${colors.border} ${colors.text} ring-2 ring-offset-1 ring-blue-500`
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {CATEGORY_ICONS[cat]} {CATEGORY_INFO[cat]?.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Logo URL (optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Logo URL (optional)
            </label>
            <input
              type="text"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            />
            {logoUrl && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-gray-500">Preview:</span>
                <img
                  src={logoUrl}
                  alt="Logo preview"
                  className="w-8 h-8 object-contain border rounded"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '';
                    (e.target as HTMLImageElement).alt = 'Invalid URL';
                  }}
                />
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="text-red-600 text-sm bg-red-50 p-2 rounded">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t bg-gray-50">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Location
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
