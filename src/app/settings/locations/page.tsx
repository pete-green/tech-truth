'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  MapPin,
  Search,
  Plus,
  Trash2,
  RefreshCw,
  Filter,
  Edit2,
  Save,
  X,
  ArrowLeft,
  Circle as CircleIcon,
  Pentagon,
  Undo2,
} from 'lucide-react';
import { MapContainer, TileLayer, Circle, MapRecenter, DraggableMarker, Polygon, PolygonDrawer } from '@/components/LeafletMapWrapper';
import { CustomLocation, LocationCategory, CATEGORY_INFO, BoundaryType } from '@/types/custom-location';
import { CATEGORY_ICONS, getCategoryColors } from '@/lib/location-logos';

interface EditingLocation extends CustomLocation {
  isDirty: boolean;
}

export default function LocationsPage() {
  const [locations, setLocations] = useState<CustomLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<LocationCategory | 'all'>('all');
  const [editingLocation, setEditingLocation] = useState<EditingLocation | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [isDrawingPolygon, setIsDrawingPolygon] = useState(false);

  // Delay map rendering to avoid SSR issues
  useEffect(() => {
    const timer = setTimeout(() => setMapReady(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const fetchLocations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/custom-locations');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setLocations(data.locations || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  const filteredLocations = locations.filter((loc) => {
    const matchesSearch =
      searchQuery === '' ||
      loc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (loc.address && loc.address.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = categoryFilter === 'all' || loc.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const handleEdit = (location: CustomLocation) => {
    setEditingLocation({ ...location, isDirty: false });
    setIsDrawingPolygon(location.boundaryType === 'polygon');
  };

  const handleCancelEdit = () => {
    setEditingLocation(null);
    setIsDrawingPolygon(false);
  };

  const handleSave = async () => {
    if (!editingLocation) return;

    // Validate polygon if using polygon boundary
    if (editingLocation.boundaryType === 'polygon' &&
        (!editingLocation.boundaryPolygon || editingLocation.boundaryPolygon.length < 3)) {
      setError('Polygon boundary requires at least 3 points');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/custom-locations/${editingLocation.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingLocation.name,
          category: editingLocation.category,
          logoUrl: editingLocation.logoUrl,
          centerLatitude: editingLocation.centerLatitude,
          centerLongitude: editingLocation.centerLongitude,
          radiusFeet: editingLocation.radiusFeet,
          boundaryType: editingLocation.boundaryType,
          boundaryPolygon: editingLocation.boundaryPolygon,
          address: editingLocation.address,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error);
      }

      // Refresh the list
      await fetchLocations();
      setEditingLocation(null);
      setIsDrawingPolygon(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this location? This cannot be undone.')) {
      return;
    }

    setDeleting(id);
    try {
      const response = await fetch(`/api/custom-locations/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error);
      }

      // Refresh the list
      await fetchLocations();
      if (editingLocation?.id === id) {
        setEditingLocation(null);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeleting(null);
    }
  };

  const updateEditingField = (field: keyof CustomLocation, value: any) => {
    if (!editingLocation) return;
    setEditingLocation({
      ...editingLocation,
      [field]: value,
      isDirty: true,
    });
  };

  const categories: LocationCategory[] = ['gas_station', 'supply_house', 'restaurant', 'parts_store', 'other'];

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            href="/settings"
            className="flex items-center gap-2 text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Custom Locations</h1>
            <p className="text-gray-500 mt-1">Manage labeled locations and geofences</p>
          </div>
        </div>
        <button
          onClick={fetchLocations}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex gap-6">
          {/* Left Panel - Location List */}
          <div className="w-96 flex-shrink-0">
            {/* Search and Filter */}
            <div className="bg-white rounded-lg shadow-sm border p-4 mb-4">
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search locations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-400" />
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value as LocationCategory | 'all')}
                  className="flex-1 border rounded-lg px-3 py-1.5 text-sm"
                >
                  <option value="all">All Categories</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {CATEGORY_ICONS[cat]} {CATEGORY_INFO[cat]?.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Location List */}
            <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
              <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                <span className="font-medium text-gray-700">
                  {filteredLocations.length} Location{filteredLocations.length !== 1 ? 's' : ''}
                </span>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
                </div>
              ) : filteredLocations.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  {searchQuery || categoryFilter !== 'all'
                    ? 'No locations match your filters'
                    : 'No custom locations yet'}
                </div>
              ) : (
                <div className="divide-y max-h-[calc(100vh-320px)] overflow-y-auto">
                  {filteredLocations.map((location) => {
                    const colors = getCategoryColors(location.category);
                    const isSelected = editingLocation?.id === location.id;

                    return (
                      <div
                        key={location.id}
                        onClick={() => handleEdit(location)}
                        className={`p-4 cursor-pointer transition-colors ${
                          isSelected ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {location.logoUrl ? (
                            <img
                              src={location.logoUrl}
                              alt={location.name}
                              className="w-10 h-10 object-contain rounded"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className={`w-10 h-10 rounded flex items-center justify-center text-lg ${colors.bg}`}>
                              {CATEGORY_ICONS[location.category || 'other']}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900 truncate">
                                {location.name}
                              </span>
                              <span className={`text-xs px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}>
                                {CATEGORY_INFO[location.category || 'other']?.label}
                              </span>
                            </div>
                            {location.address && (
                              <p className="text-sm text-gray-500 truncate mt-0.5">
                                {location.address}
                              </p>
                            )}
                            <p className="text-xs text-gray-400 mt-1 flex items-center gap-2">
                              {location.boundaryType === 'polygon' ? (
                                <>
                                  <Pentagon className="w-3 h-3" />
                                  Custom shape ({location.boundaryPolygon?.length || 0} points)
                                </>
                              ) : (
                                <>
                                  <CircleIcon className="w-3 h-3" />
                                  {location.radiusFeet} ft radius
                                </>
                              )}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Edit Location */}
          <div className="flex-1">
            {editingLocation ? (
              <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
                {/* Edit Header */}
                <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Edit2 className="w-4 h-4 text-gray-500" />
                    <span className="font-medium text-gray-700">Edit Location</span>
                    {editingLocation.isDirty && (
                      <span className="text-xs text-orange-600 bg-orange-100 px-2 py-0.5 rounded">
                        Unsaved changes
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDelete(editingLocation.id)}
                      disabled={deleting === editingLocation.id}
                      className="flex items-center gap-1 px-3 py-1.5 text-red-600 hover:bg-red-50 rounded transition-colors text-sm"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="flex items-center gap-1 px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded transition-colors text-sm"
                    >
                      <X className="w-4 h-4" />
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving || !editingLocation.isDirty}
                      className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm"
                    >
                      <Save className="w-4 h-4" />
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>

                {/* Map */}
                <div className="h-80 relative">
                  {mapReady ? (
                    <MapContainer
                      center={[editingLocation.centerLatitude, editingLocation.centerLongitude]}
                      zoom={17}
                      className="h-full w-full"
                    >
                      <MapRecenter
                        lat={editingLocation.centerLatitude}
                        lon={editingLocation.centerLongitude}
                      />
                      <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      {/* Center marker (only for circle mode) */}
                      {editingLocation.boundaryType !== 'polygon' && (
                        <DraggableMarker
                          position={[editingLocation.centerLatitude, editingLocation.centerLongitude]}
                          onPositionChange={(lat, lng) => {
                            setEditingLocation((prev) =>
                              prev ? { ...prev, centerLatitude: lat, centerLongitude: lng, isDirty: true } : null
                            );
                          }}
                        />
                      )}
                      {/* Show circle or polygon based on boundary type */}
                      {editingLocation.boundaryType === 'polygon' ? (
                        <PolygonDrawer
                          points={editingLocation.boundaryPolygon || []}
                          onPointsChange={(points) => {
                            setEditingLocation((prev) =>
                              prev ? { ...prev, boundaryPolygon: points, isDirty: true } : null
                            );
                          }}
                          isDrawing={isDrawingPolygon}
                        />
                      ) : (
                        <Circle
                          center={[editingLocation.centerLatitude, editingLocation.centerLongitude]}
                          radius={editingLocation.radiusFeet * 0.3048}
                          pathOptions={{
                            color: '#3b82f6',
                            fillColor: '#3b82f6',
                            fillOpacity: 0.2,
                          }}
                        />
                      )}
                    </MapContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center bg-gray-100">
                      <span className="text-gray-500">Loading map...</span>
                    </div>
                  )}
                  <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur px-3 py-1.5 rounded-lg text-xs text-gray-600 shadow">
                    {editingLocation.boundaryType === 'polygon'
                      ? 'Click map to add points, drag to adjust'
                      : 'Drag the marker to adjust location'}
                  </div>
                </div>

                {/* Edit Form */}
                <div className="p-4 space-y-4">
                  {/* Coordinates Display */}
                  <div className="flex gap-4 text-xs text-gray-500 bg-gray-50 p-2 rounded">
                    <span>Lat: {editingLocation.centerLatitude.toFixed(6)}</span>
                    <span>Lng: {editingLocation.centerLongitude.toFixed(6)}</span>
                  </div>

                  {/* Boundary Type Toggle */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Boundary Type
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          updateEditingField('boundaryType', 'circle');
                          setIsDrawingPolygon(false);
                        }}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                          editingLocation.boundaryType !== 'polygon'
                            ? 'bg-blue-50 border-blue-500 text-blue-700 ring-2 ring-blue-500 ring-offset-1'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <CircleIcon className="w-4 h-4" />
                        Circle
                      </button>
                      <button
                        onClick={() => {
                          updateEditingField('boundaryType', 'polygon');
                          setIsDrawingPolygon(true);
                        }}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                          editingLocation.boundaryType === 'polygon'
                            ? 'bg-blue-50 border-blue-500 text-blue-700 ring-2 ring-blue-500 ring-offset-1'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <Pentagon className="w-4 h-4" />
                        Custom Shape
                      </button>
                    </div>
                  </div>

                  {/* Radius Slider (only for circle mode) */}
                  {editingLocation.boundaryType !== 'polygon' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Geofence Radius: {editingLocation.radiusFeet} ft
                      </label>
                      <input
                        type="range"
                        min="50"
                        max="1500"
                        step="25"
                        value={editingLocation.radiusFeet}
                        onChange={(e) => updateEditingField('radiusFeet', Number(e.target.value))}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                      />
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>50 ft</span>
                        <span>1500 ft</span>
                      </div>
                    </div>
                  )}

                  {/* Polygon Controls (only for polygon mode) */}
                  {editingLocation.boundaryType === 'polygon' && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm text-blue-800">
                          <span className="font-medium">Click on map to add points</span>
                          <span className="text-blue-600 ml-2">({editingLocation.boundaryPolygon?.length || 0} points)</span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              if (editingLocation.boundaryPolygon && editingLocation.boundaryPolygon.length > 0) {
                                updateEditingField('boundaryPolygon', editingLocation.boundaryPolygon.slice(0, -1));
                              }
                            }}
                            disabled={!editingLocation.boundaryPolygon?.length}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-white border border-blue-300 rounded hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Undo2 className="w-3 h-3" />
                            Undo
                          </button>
                          <button
                            onClick={() => updateEditingField('boundaryPolygon', [])}
                            disabled={!editingLocation.boundaryPolygon?.length}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-white border border-blue-300 rounded hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="w-3 h-3" />
                            Clear
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-blue-600">
                        Drag points to adjust. Click a point to delete it (min 3 points).
                      </p>
                      {(editingLocation.boundaryPolygon?.length || 0) > 0 && (editingLocation.boundaryPolygon?.length || 0) < 3 && (
                        <p className="text-xs text-orange-600 mt-1">
                          Add {3 - (editingLocation.boundaryPolygon?.length || 0)} more point{3 - (editingLocation.boundaryPolygon?.length || 0) > 1 ? 's' : ''} to complete the shape.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Location Name
                    </label>
                    <input
                      type="text"
                      value={editingLocation.name}
                      onChange={(e) => updateEditingField('name', e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>

                  {/* Category */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Category
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {categories.map((cat) => {
                        const colors = getCategoryColors(cat);
                        const isSelected = editingLocation.category === cat;
                        return (
                          <button
                            key={cat}
                            onClick={() => updateEditingField('category', cat)}
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

                  {/* Address */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Address
                    </label>
                    <input
                      type="text"
                      value={editingLocation.address || ''}
                      onChange={(e) => updateEditingField('address', e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>

                  {/* Logo URL */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Logo URL
                    </label>
                    <input
                      type="text"
                      value={editingLocation.logoUrl || ''}
                      onChange={(e) => updateEditingField('logoUrl', e.target.value)}
                      placeholder="https://..."
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                    />
                    {editingLocation.logoUrl && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-xs text-gray-500">Preview:</span>
                        <img
                          src={editingLocation.logoUrl}
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
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
                <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-700 mb-2">Select a Location</h3>
                <p className="text-gray-500">
                  Click on a location from the list to edit its geofence, position, and details.
                </p>
              </div>
            )}
          </div>
        </div>
    </main>
  );
}
