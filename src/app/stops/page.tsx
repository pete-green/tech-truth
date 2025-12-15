'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { format, parseISO, eachDayOfInterval } from 'date-fns';
import {
  Calendar,
  User,
  RefreshCw,
  MapPin,
  AlertTriangle,
  Briefcase,
  Building,
  Fuel,
  UtensilsCrossed,
  Wrench,
  Package,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Tag,
} from 'lucide-react';
import DayTimelineComponent from '@/components/DayTimeline';
import SimpleMapModal from '@/components/SimpleMapModal';
import LabelLocationModal from '@/components/LabelLocationModal';
import { DayTimeline, TimelineEvent } from '@/types/timeline';
import { LocationCategory, BoundaryType } from '@/types/custom-location';

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

// Stop detail for expanded view
interface StopDetail {
  id: string;
  name: string;
  address?: string;
  date: string;
  time: string;
  durationMinutes: number;
  logoUrl?: string;
  latitude?: number;
  longitude?: number;
}

// Category breakdown
interface CategoryBreakdown {
  category: string;
  label: string;
  icon: React.ReactNode;
  totalMinutes: number;
  stopCount: number;
  stops: StopDetail[];
  bgColor: string;
  textColor: string;
  borderColor: string;
  isWarning?: boolean;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatDurationLong(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} minutes`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins > 0) {
    return `${hours} hour${hours !== 1 ? 's' : ''} ${mins} min`;
  }
  return `${hours} hour${hours !== 1 ? 's' : ''}`;
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

  // Expanded category state
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

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
    setExpandedCategory(null);

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

  // Calculate time breakdown by category
  const categoryBreakdowns = useMemo((): CategoryBreakdown[] => {
    if (timelines.length === 0) return [];

    const categories: Record<string, { minutes: number; stops: StopDetail[] }> = {
      jobs: { minutes: 0, stops: [] },
      office: { minutes: 0, stops: [] },
      gas_station: { minutes: 0, stops: [] },
      restaurant: { minutes: 0, stops: [] },
      parts_store: { minutes: 0, stops: [] },
      supply_house: { minutes: 0, stops: [] },
      other: { minutes: 0, stops: [] },
      unknown: { minutes: 0, stops: [] },
    };

    // Process all timeline events
    for (const timeline of timelines) {
      for (const event of timeline.events) {
        const duration = event.durationMinutes || 0;
        if (duration <= 0) continue;

        const stopDetail: StopDetail = {
          id: event.id,
          name: '',
          address: event.address,
          date: format(parseISO(timeline.date), 'MMM d, yyyy'),
          time: format(parseISO(event.timestamp), 'h:mm a'),
          durationMinutes: duration,
          logoUrl: event.customLocationLogo,
          latitude: event.latitude,
          longitude: event.longitude,
        };

        switch (event.type) {
          case 'arrived_job':
            stopDetail.name = `Job #${event.jobNumber}${event.customerName ? ` - ${event.customerName}` : ''}`;
            categories.jobs.minutes += duration;
            categories.jobs.stops.push(stopDetail);
            break;

          case 'arrived_office':
            stopDetail.name = 'Office / Shop';
            categories.office.minutes += duration;
            categories.office.stops.push(stopDetail);
            break;

          case 'arrived_custom':
            stopDetail.name = event.customLocationName || 'Custom Location';
            const customCategory = event.customLocationCategory || 'other';
            if (categories[customCategory]) {
              categories[customCategory].minutes += duration;
              categories[customCategory].stops.push(stopDetail);
            } else {
              categories.other.minutes += duration;
              categories.other.stops.push(stopDetail);
            }
            break;

          case 'arrived_unknown':
            stopDetail.name = 'Unknown Location';
            categories.unknown.minutes += duration;
            categories.unknown.stops.push(stopDetail);
            break;
        }
      }
    }

    // Sort stops by duration (longest first) within each category
    for (const cat of Object.values(categories)) {
      cat.stops.sort((a, b) => b.durationMinutes - a.durationMinutes);
    }

    // Build breakdown array
    const breakdowns: CategoryBreakdown[] = [
      {
        category: 'jobs',
        label: 'Jobs',
        icon: <Briefcase className="w-5 h-5" />,
        totalMinutes: categories.jobs.minutes,
        stopCount: categories.jobs.stops.length,
        stops: categories.jobs.stops,
        bgColor: 'bg-blue-50',
        textColor: 'text-blue-700',
        borderColor: 'border-blue-200',
      },
      {
        category: 'office',
        label: 'Office / Shop',
        icon: <Building className="w-5 h-5" />,
        totalMinutes: categories.office.minutes,
        stopCount: categories.office.stops.length,
        stops: categories.office.stops,
        bgColor: 'bg-purple-50',
        textColor: 'text-purple-700',
        borderColor: 'border-purple-200',
      },
      {
        category: 'gas_station',
        label: 'Gas Stations',
        icon: <Fuel className="w-5 h-5" />,
        totalMinutes: categories.gas_station.minutes,
        stopCount: categories.gas_station.stops.length,
        stops: categories.gas_station.stops,
        bgColor: 'bg-red-50',
        textColor: 'text-red-700',
        borderColor: 'border-red-200',
        isWarning: categories.gas_station.minutes > 30, // Flag if > 30 min total at gas stations
      },
      {
        category: 'restaurant',
        label: 'Restaurants',
        icon: <UtensilsCrossed className="w-5 h-5" />,
        totalMinutes: categories.restaurant.minutes,
        stopCount: categories.restaurant.stops.length,
        stops: categories.restaurant.stops,
        bgColor: 'bg-orange-50',
        textColor: 'text-orange-700',
        borderColor: 'border-orange-200',
        isWarning: categories.restaurant.minutes > 60, // Flag if > 1 hour at restaurants
      },
      {
        category: 'supply_house',
        label: 'Supply Houses',
        icon: <Package className="w-5 h-5" />,
        totalMinutes: categories.supply_house.minutes,
        stopCount: categories.supply_house.stops.length,
        stops: categories.supply_house.stops,
        bgColor: 'bg-cyan-50',
        textColor: 'text-cyan-700',
        borderColor: 'border-cyan-200',
      },
      {
        category: 'parts_store',
        label: 'Parts Stores',
        icon: <Wrench className="w-5 h-5" />,
        totalMinutes: categories.parts_store.minutes,
        stopCount: categories.parts_store.stops.length,
        stops: categories.parts_store.stops,
        bgColor: 'bg-indigo-50',
        textColor: 'text-indigo-700',
        borderColor: 'border-indigo-200',
      },
      {
        category: 'other',
        label: 'Other',
        icon: <Tag className="w-5 h-5" />,
        totalMinutes: categories.other.minutes,
        stopCount: categories.other.stops.length,
        stops: categories.other.stops,
        bgColor: 'bg-gray-50',
        textColor: 'text-gray-700',
        borderColor: 'border-gray-200',
      },
      {
        category: 'unknown',
        label: 'Unknown Stops',
        icon: <HelpCircle className="w-5 h-5" />,
        totalMinutes: categories.unknown.minutes,
        stopCount: categories.unknown.stops.length,
        stops: categories.unknown.stops,
        bgColor: 'bg-yellow-50',
        textColor: 'text-yellow-700',
        borderColor: 'border-yellow-300',
        isWarning: categories.unknown.minutes > 30, // Flag if > 30 min at unknown
      },
    ];

    // Filter out empty categories and sort by time (most time first)
    return breakdowns
      .filter(b => b.stopCount > 0)
      .sort((a, b) => b.totalMinutes - a.totalMinutes);
  }, [timelines]);

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
    boundaryType: BoundaryType;
    boundaryPolygon?: [number, number][];
  }) => {
    if (!labelLocation) return;

    const response = await fetch('/api/custom-locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: data.name,
        category: data.category,
        logoUrl: data.logoUrl,
        centerLatitude: labelLocation.latitude,
        centerLongitude: labelLocation.longitude,
        radiusFeet: data.radiusFeet,
        boundaryType: data.boundaryType,
        boundaryPolygon: data.boundaryPolygon,
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

  const toggleCategory = (category: string) => {
    setExpandedCategory(expandedCategory === category ? null : category);
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
                    {formatDuration(totalDriveMinutes)}
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

          {/* Time Breakdown Cards */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
              Time Breakdown by Location Type
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {categoryBreakdowns.map((breakdown) => (
                <div key={breakdown.category}>
                  <button
                    onClick={() => toggleCategory(breakdown.category)}
                    className={`w-full text-left rounded-lg border-2 p-4 transition-all ${
                      breakdown.isWarning
                        ? 'border-red-400 bg-red-50 ring-2 ring-red-200'
                        : `${breakdown.borderColor} ${breakdown.bgColor}`
                    } ${
                      expandedCategory === breakdown.category
                        ? 'ring-2 ring-blue-400'
                        : 'hover:shadow-md'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className={`${breakdown.isWarning ? 'text-red-600' : breakdown.textColor}`}>
                        {breakdown.icon}
                      </div>
                      {breakdown.isWarning && (
                        <AlertTriangle className="w-5 h-5 text-red-500 animate-pulse" />
                      )}
                      {expandedCategory === breakdown.category ? (
                        <ChevronUp className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                    <p className={`text-2xl font-bold ${breakdown.isWarning ? 'text-red-700' : breakdown.textColor}`}>
                      {formatDuration(breakdown.totalMinutes)}
                    </p>
                    <p className={`text-sm font-medium ${breakdown.isWarning ? 'text-red-600' : breakdown.textColor}`}>
                      {breakdown.label}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {breakdown.stopCount} stop{breakdown.stopCount !== 1 ? 's' : ''}
                    </p>
                  </button>

                  {/* Expanded Details */}
                  {expandedCategory === breakdown.category && (
                    <div className={`mt-2 rounded-lg border ${breakdown.borderColor} ${breakdown.bgColor} overflow-hidden`}>
                      <div className="px-3 py-2 border-b border-gray-200 bg-white/50">
                        <p className="text-sm font-medium text-gray-700">
                          {breakdown.label} - {formatDurationLong(breakdown.totalMinutes)} total
                        </p>
                      </div>
                      <div className="max-h-64 overflow-y-auto">
                        {breakdown.stops.map((stop, idx) => (
                          <div
                            key={stop.id}
                            className={`px-3 py-2 flex items-start gap-3 ${
                              idx !== breakdown.stops.length - 1 ? 'border-b border-gray-200/50' : ''
                            } ${stop.durationMinutes >= 45 ? 'bg-red-100/50' : ''}`}
                          >
                            {stop.logoUrl ? (
                              <img
                                src={stop.logoUrl}
                                alt=""
                                className="w-8 h-8 object-contain flex-shrink-0 mt-0.5"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className={`w-8 h-8 rounded-full ${breakdown.bgColor} flex items-center justify-center flex-shrink-0`}>
                                <Clock className={`w-4 h-4 ${breakdown.textColor}`} />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {stop.name}
                              </p>
                              {stop.address && (
                                <p className="text-xs text-gray-500 truncate">
                                  {stop.address}
                                </p>
                              )}
                              <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                                <span>{stop.date}</span>
                                <span>at</span>
                                <span>{stop.time}</span>
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className={`text-sm font-bold ${
                                stop.durationMinutes >= 45 ? 'text-red-600' : breakdown.textColor
                              }`}>
                                {formatDuration(stop.durationMinutes)}
                              </p>
                              {stop.latitude && stop.longitude && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleShowMapLocation({
                                      latitude: stop.latitude!,
                                      longitude: stop.longitude!,
                                      label: stop.name,
                                      address: stop.address,
                                    });
                                  }}
                                  className="text-xs text-blue-600 hover:underline mt-1"
                                >
                                  View Map
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Timeline List */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Day-by-Day Timeline
            </h3>
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
