'use client';

import { useState, useEffect, useCallback } from 'react';
import { format, parseISO, eachDayOfInterval } from 'date-fns';
import {
  Calendar,
  User,
  RefreshCw,
  MapPin,
  AlertTriangle,
} from 'lucide-react';
import DayTimelineComponent from '@/components/DayTimeline';
import SimpleMapModal from '@/components/SimpleMapModal';
import LabelLocationModal from '@/components/LabelLocationModal';
import { DayTimeline } from '@/types/timeline';
import { LocationCategory } from '@/types/custom-location';

interface Technician {
  id: string;
  name: string;
  st_technician_id: number;
  verizon_vehicle_id: string | null;
  takes_truck_home: boolean;
}

interface MapLocation {
  latitude: number;
  longitude: number;
  label: string;
  address?: string;
}

interface LabelLocationData {
  latitude: number;
  longitude: number;
  address: string;
}

export default function StopDetailsPage() {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [selectedTechId, setSelectedTechId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [timelines, setTimelines] = useState<DayTimeline[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingTechs, setLoadingTechs] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Map modal state
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [mapLocation, setMapLocation] = useState<MapLocation | null>(null);

  // Label location modal state
  const [labelModalOpen, setLabelModalOpen] = useState(false);
  const [labelLocation, setLabelLocation] = useState<LabelLocationData | null>(null);

  // Initialize dates on client side
  useEffect(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    setStartDate(today);
    setEndDate(today);
  }, []);

  // Fetch technicians on mount
  useEffect(() => {
    const fetchTechnicians = async () => {
      try {
        const response = await fetch('/api/technicians');
        const data = await response.json();
        if (data.success) {
          // Filter to only technicians with GPS vehicles
          const withGps = data.technicians.filter((t: Technician) => t.verizon_vehicle_id);
          setTechnicians(withGps);
        }
      } catch (err: any) {
        console.error('Error fetching technicians:', err);
      } finally {
        setLoadingTechs(false);
      }
    };
    fetchTechnicians();
  }, []);

  const fetchTimelines = useCallback(async () => {
    if (!selectedTechId || !startDate || !endDate) return;

    setLoading(true);
    setError(null);
    setTimelines([]);

    try {
      // Get all dates in the range
      const start = parseISO(startDate);
      const end = parseISO(endDate);
      const dates = eachDayOfInterval({ start, end });

      // Fetch timeline for each date
      const timelinePromises = dates.map(async (date) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        const response = await fetch(
          `/api/reports/technician-timeline?technicianId=${selectedTechId}&date=${dateStr}`
        );
        const data = await response.json();

        if (data.success && data.timeline) {
          return data.timeline as DayTimeline;
        }
        return null;
      });

      const results = await Promise.all(timelinePromises);
      const validTimelines = results.filter((t): t is DayTimeline => t !== null);

      setTimelines(validTimelines);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch timelines');
    } finally {
      setLoading(false);
    }
  }, [selectedTechId, startDate, endDate]);

  const handleShowMapLocation = (location: MapLocation) => {
    setMapLocation(location);
    setMapModalOpen(true);
  };

  const handleLabelLocation = (location: LabelLocationData) => {
    setLabelLocation(location);
    setLabelModalOpen(true);
  };

  const handleSaveLocation = async (data: {
    name: string;
    category: LocationCategory;
    logoUrl?: string;
    radiusFeet: number;
  }) => {
    if (!labelLocation) return;

    const response = await fetch('/api/custom-locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: data.name,
        category: data.category,
        logoUrl: data.logoUrl,
        latitude: labelLocation.latitude,
        longitude: labelLocation.longitude,
        radiusFeet: data.radiusFeet,
        address: labelLocation.address,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to save location');
    }

    // Refresh timelines to show the new labeled location
    await fetchTimelines();
  };

  const selectedTech = technicians.find(t => t.id === selectedTechId);

  // Calculate summary stats
  const totalJobs = timelines.reduce((sum, t) => sum + t.totalJobs, 0);
  const totalDriveMinutes = timelines.reduce((sum, t) => sum + t.totalDriveMinutes, 0);
  const lateFirstJobs = timelines.filter(t => t.firstJobOnTime === false).length;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Stop Details</h1>
        <p className="text-gray-500 mt-1">View detailed timeline of technician stops and activities</p>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
        <div className="flex flex-wrap items-end gap-4">
          {/* Technician Selector */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <User className="w-4 h-4 inline mr-1" />
              Technician
            </label>
            <select
              value={selectedTechId}
              onChange={(e) => setSelectedTechId(e.target.value)}
              disabled={loadingTechs}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a technician...</option>
              {technicians.map((tech) => (
                <option key={tech.id} value={tech.id}>
                  {tech.name}
                </option>
              ))}
            </select>
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Calendar className="w-4 h-4 inline mr-1" />
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Calendar className="w-4 h-4 inline mr-1" />
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={startDate}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Load Button */}
          <button
            onClick={fetchTimelines}
            disabled={!selectedTechId || !startDate || !endDate || loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <MapPin className="w-4 h-4" />
                Load Timeline
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2 text-red-700">
          <AlertTriangle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      {/* Content Area */}
      {!selectedTechId ? (
        <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
          <User className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">Select a technician to view their stops</p>
          <p className="text-gray-400 text-sm mt-1">
            Choose a technician from the dropdown above and click &quot;Load Timeline&quot;
          </p>
        </div>
      ) : loading ? (
        <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
          <RefreshCw className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Loading timeline data...</p>
        </div>
      ) : timelines.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
          <MapPin className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">No GPS data found</p>
          <p className="text-gray-400 text-sm mt-1">
            Click &quot;Load Timeline&quot; to fetch data, or try a different date range
          </p>
        </div>
      ) : (
        <>
          {/* Summary Header */}
          <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Timeline for {selectedTech?.name}
                </h2>
                <p className="text-sm text-gray-500">
                  {format(parseISO(startDate), 'MMM d, yyyy')}
                  {startDate !== endDate && ` - ${format(parseISO(endDate), 'MMM d, yyyy')}`}
                </p>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">{timelines.length}</p>
                  <p className="text-gray-500">Days</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">{totalJobs}</p>
                  <p className="text-gray-500">Jobs</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">
                    {totalDriveMinutes > 60
                      ? `${Math.floor(totalDriveMinutes / 60)}h ${totalDriveMinutes % 60}m`
                      : `${totalDriveMinutes}m`}
                  </p>
                  <p className="text-gray-500">Drive Time</p>
                </div>
                {lateFirstJobs > 0 && (
                  <div className="text-center">
                    <p className="text-2xl font-bold text-red-600">{lateFirstJobs}</p>
                    <p className="text-gray-500">Late First Jobs</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Timeline List */}
          <div className="space-y-4">
            {timelines.map((timeline) => (
              <DayTimelineComponent
                key={timeline.date}
                timeline={timeline}
                onShowMapLocation={handleShowMapLocation}
                onLabelLocation={handleLabelLocation}
              />
            ))}
          </div>
        </>
      )}

      {/* Map Modal */}
      {mapLocation && (
        <SimpleMapModal
          isOpen={mapModalOpen}
          onClose={() => {
            setMapModalOpen(false);
            setMapLocation(null);
          }}
          latitude={mapLocation.latitude}
          longitude={mapLocation.longitude}
          label={mapLocation.label}
          address={mapLocation.address}
        />
      )}

      {/* Label Location Modal */}
      {labelLocation && (
        <LabelLocationModal
          isOpen={labelModalOpen}
          onClose={() => {
            setLabelModalOpen(false);
            setLabelLocation(null);
          }}
          latitude={labelLocation.latitude}
          longitude={labelLocation.longitude}
          address={labelLocation.address}
          onSave={handleSaveLocation}
        />
      )}
    </main>
  );
}
