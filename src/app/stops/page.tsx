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
import DayTimelineComponent, { AssignJobData, AnnotatePunchData, AddMissingPunchData } from '@/components/DayTimeline';
import GoogleMapsModal from '@/components/GoogleMapsModal';
import LabelLocationModal from '@/components/LabelLocationModal';
import AssignJobModal from '@/components/AssignJobModal';
import PunchAnnotationModal from '@/components/PunchAnnotationModal';
import ProposedPunchModal from '@/components/ProposedPunchModal';
import ViolationsPanel, { Violation } from '@/components/ViolationsPanel';
import DataStatusCard from '@/components/DataStatusCard';
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

  // Assign job modal state
  const [assignJobModalOpen, setAssignJobModalOpen] = useState(false);
  const [assignJobData, setAssignJobData] = useState<AssignJobData | null>(null);

  // Punch annotation modal state
  const [annotationModalOpen, setAnnotationModalOpen] = useState(false);
  const [annotationData, setAnnotationData] = useState<AnnotatePunchData | null>(null);
  const [annotationCounts, setAnnotationCounts] = useState<Record<string, number>>({});

  // Proposed punch modal state
  const [proposedPunchModalOpen, setProposedPunchModalOpen] = useState(false);
  const [proposedPunchData, setProposedPunchData] = useState<AddMissingPunchData | null>(null);

  // Violations state
  const [violations, setViolations] = useState<Violation[]>([]);

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
    setViolations([]);
    setExpandedCategory(null);

    try {
      // Get all dates in the range
      const start = parseISO(startDate);
      const end = parseISO(endDate);
      const dates = eachDayOfInterval({ start, end });

      // Fetch timeline for each date and violations in parallel
      const [timelinesResults, violationsResponse] = await Promise.all([
        Promise.all(dates.map(async (date) => {
          const dateStr = format(date, 'yyyy-MM-dd');
          const response = await fetch(
            `/api/reports/technician-timeline?technicianId=${selectedTechId}&date=${dateStr}`
          );
          const data = await response.json();

          if (data.success && data.timeline) {
            return data.timeline as DayTimeline;
          }
          return null;
        })),
        fetch(`/api/reports/punch-violations?startDate=${startDate}&endDate=${endDate}&technicianId=${selectedTechId}`)
      ]);

      const validTimelines = timelinesResults.filter((t): t is DayTimeline => t !== null);
      setTimelines(validTimelines);

      // Parse violations
      const violationsData = await violationsResponse.json();
      if (violationsData.success) {
        setViolations(violationsData.violations || []);
      }
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

  // Handle excusing a violation
  const handleExcuseViolation = async (violation: Violation, reason: string, notes?: string) => {
    const response = await fetch('/api/excused-visits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        technicianId: violation.technicianId,
        visitDate: violation.date,
        reason,
        notes,
      }),
    });

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to excuse violation');
    }

    // Update local state to show the excuse immediately
    setViolations(prev => prev.map(v =>
      v.id === violation.id
        ? { ...v, isExcused: true, excusedReason: reason }
        : v
    ));

    // Refresh timelines to update the badges
    await fetchTimelines();
  };

  // Handle removing an excuse
  const handleRemoveExcuse = async (violation: Violation) => {
    const response = await fetch(
      `/api/excused-visits?technicianId=${violation.technicianId}&visitDate=${violation.date}`,
      { method: 'DELETE' }
    );

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to remove excuse');
    }

    // Update local state
    setViolations(prev => prev.map(v =>
      v.id === violation.id
        ? { ...v, isExcused: false, excusedReason: undefined }
        : v
    ));

    // Refresh timelines to update the badges
    await fetchTimelines();
  };

  // Handle assigning a job to an unknown stop
  const handleOpenAssignJob = (data: AssignJobData) => {
    setAssignJobData(data);
    setAssignJobModalOpen(true);
  };

  const handleAssignJob = async (jobId: string) => {
    if (!assignJobData) return;

    const response = await fetch('/api/manual-job-associations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        technicianId: assignJobData.technicianId,
        jobId,
        jobDate: assignJobData.date,
        gpsLatitude: assignJobData.latitude,
        gpsLongitude: assignJobData.longitude,
        gpsTimestamp: assignJobData.timestamp,
        gpsAddress: assignJobData.address,
      }),
    });

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to assign job');
    }

    // Refresh timelines to show the updated data
    await fetchTimelines();
  };

  // Handle opening annotation modal
  const handleOpenAnnotation = (data: AnnotatePunchData) => {
    setAnnotationData(data);
    setAnnotationModalOpen(true);
  };

  // Handle opening proposed punch modal
  const handleOpenProposedPunch = (data: AddMissingPunchData) => {
    setProposedPunchData(data);
    setProposedPunchModalOpen(true);
  };

  // Fetch annotation counts for all punch records in current timelines
  const fetchAnnotationCounts = useCallback(async () => {
    if (timelines.length === 0) return;

    // Collect all punch IDs from timelines
    const punchIds: string[] = [];
    for (const timeline of timelines) {
      for (const event of timeline.events) {
        if (event.punchId) {
          punchIds.push(event.punchId);
        }
      }
    }

    if (punchIds.length === 0) return;

    // Fetch annotation counts for each punch ID
    const counts: Record<string, number> = {};
    await Promise.all(
      punchIds.map(async (punchId) => {
        try {
          const response = await fetch(`/api/punch-annotations?punchRecordId=${punchId}`);
          const data = await response.json();
          if (data.success) {
            counts[punchId] = data.annotations.length;
          }
        } catch (err) {
          console.error(`Error fetching annotation count for ${punchId}:`, err);
        }
      })
    );
    setAnnotationCounts(counts);
  }, [timelines]);

  // Fetch annotation counts when timelines change
  useEffect(() => {
    fetchAnnotationCounts();
  }, [fetchAnnotationCounts]);

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
      <div className="bg-gradient-to-r from-slate-50 to-blue-50 rounded-2xl shadow-md border border-slate-200/60 p-6 mb-6">
        <div className="flex flex-wrap items-end gap-5">
          {/* Technician Selector */}
          <div className="flex-1 min-w-[220px]">
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              <User className="w-4 h-4 inline mr-1.5 text-blue-600" />
              Technician
            </label>
            <select
              value={selectedTechId}
              onChange={(e) => setSelectedTechId(e.target.value)}
              disabled={loadingTechs}
              className="w-full bg-white border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all hover:border-slate-300 shadow-sm"
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
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              <Calendar className="w-4 h-4 inline mr-1.5 text-blue-600" />
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-white border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all hover:border-slate-300 shadow-sm"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              <Calendar className="w-4 h-4 inline mr-1.5 text-blue-600" />
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={startDate}
              className="bg-white border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all hover:border-slate-300 shadow-sm"
            />
          </div>

          {/* Load Button */}
          <button
            onClick={fetchTimelines}
            disabled={!selectedTechId || !startDate || !endDate || loading}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-lg transition-all duration-200"
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
        <div className="mb-6 bg-red-50 border-2 border-red-200 rounded-xl p-4 flex items-center gap-3 text-red-700 shadow-sm">
          <div className="p-2 bg-red-100 rounded-full">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <span className="font-medium">{error}</span>
        </div>
      )}

      {/* Content Area */}
      {!selectedTechId ? (
        <div className="bg-gradient-to-b from-white to-slate-50 rounded-2xl shadow-md border border-slate-200 p-16 text-center">
          <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <User className="w-10 h-10 text-slate-400" />
          </div>
          <p className="text-slate-700 text-xl font-semibold">Select a technician to view their stops</p>
          <p className="text-slate-500 mt-2 max-w-md mx-auto">
            Choose a technician from the dropdown above and click &quot;Load Timeline&quot; to see their daily activities
          </p>
        </div>
      ) : loading ? (
        <div className="bg-gradient-to-b from-white to-blue-50 rounded-2xl shadow-md border border-blue-100 p-16 text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
          <p className="text-slate-700 text-lg font-medium">Loading timeline data...</p>
          <p className="text-slate-500 mt-1">Fetching GPS segments and job information</p>
        </div>
      ) : timelines.length === 0 ? (
        <div className="bg-gradient-to-b from-white to-amber-50 rounded-2xl shadow-md border border-amber-100 p-16 text-center">
          <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <MapPin className="w-10 h-10 text-amber-500" />
          </div>
          <p className="text-slate-700 text-xl font-semibold">No GPS data found</p>
          <p className="text-slate-500 mt-2 max-w-md mx-auto">
            Click &quot;Load Timeline&quot; to fetch data, or try selecting a different date range
          </p>
        </div>
      ) : (
        <>
          {/* Summary Header */}
          <div className="bg-gradient-to-r from-white to-slate-50 rounded-2xl shadow-md border border-slate-200 p-6 mb-6">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Timeline for {selectedTech?.name}
                </h2>
                <p className="text-sm text-slate-500 mt-1 font-medium">
                  {format(parseISO(startDate), 'MMMM d, yyyy')}
                  {startDate !== endDate && ` - ${format(parseISO(endDate), 'MMMM d, yyyy')}`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {/* Days Stat Card */}
                <div className="bg-slate-100 rounded-xl px-5 py-3 text-center min-w-[90px] border border-slate-200">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <Calendar className="w-4 h-4 text-slate-600" />
                    <p className="text-2xl font-bold text-slate-800">{timelines.length}</p>
                  </div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Days</p>
                </div>
                {/* Jobs Stat Card */}
                <div className="bg-blue-50 rounded-xl px-5 py-3 text-center min-w-[90px] border border-blue-200">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <Briefcase className="w-4 h-4 text-blue-600" />
                    <p className="text-2xl font-bold text-blue-700">{totalJobs}</p>
                  </div>
                  <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Jobs</p>
                </div>
                {/* Drive Time Stat Card */}
                <div className="bg-emerald-50 rounded-xl px-5 py-3 text-center min-w-[90px] border border-emerald-200">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <MapPin className="w-4 h-4 text-emerald-600" />
                    <p className="text-2xl font-bold text-emerald-700">
                      {formatDuration(totalDriveMinutes)}
                    </p>
                  </div>
                  <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">Drive Time</p>
                </div>
                {/* Late First Jobs Stat Card */}
                {lateFirstJobs > 0 && (
                  <div className="bg-red-50 rounded-xl px-5 py-3 text-center min-w-[90px] border-2 border-red-300">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                      <p className="text-2xl font-bold text-red-700">{lateFirstJobs}</p>
                    </div>
                    <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">Late</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Data Status Card - Shows punch data availability and sync status */}
          {startDate === endDate && selectedTech && (
            <DataStatusCard
              technicianId={selectedTechId}
              technicianName={selectedTech.name}
              date={startDate}
              onRefresh={fetchTimelines}
            />
          )}

          {/* Time Breakdown Cards */}
          <div className="mb-6">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">
              Time Breakdown by Location Type
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {categoryBreakdowns.map((breakdown) => (
                <div key={breakdown.category}>
                  <button
                    onClick={() => toggleCategory(breakdown.category)}
                    className={`w-full text-left rounded-2xl border-2 p-5 transition-all duration-300 ${
                      breakdown.isWarning
                        ? 'border-red-400 bg-gradient-to-br from-red-50 to-red-100 ring-2 ring-red-200 shadow-md'
                        : `${breakdown.borderColor} ${breakdown.bgColor}`
                    } ${
                      expandedCategory === breakdown.category
                        ? 'ring-2 ring-blue-400 shadow-lg -translate-y-1'
                        : 'hover:shadow-lg hover:-translate-y-1'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className={`p-2 rounded-xl ${breakdown.isWarning ? 'bg-red-200 text-red-700' : `bg-white/60 ${breakdown.textColor}`}`}>
                        {breakdown.icon}
                      </div>
                      <div className="flex items-center gap-1">
                        {breakdown.isWarning && (
                          <AlertTriangle className="w-5 h-5 text-red-500 animate-pulse" />
                        )}
                        {expandedCategory === breakdown.category ? (
                          <ChevronUp className="w-5 h-5 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-slate-400" />
                        )}
                      </div>
                    </div>
                    <p className={`text-3xl font-bold ${breakdown.isWarning ? 'text-red-700' : breakdown.textColor}`}>
                      {formatDuration(breakdown.totalMinutes)}
                    </p>
                    <p className={`text-sm font-semibold mt-1 ${breakdown.isWarning ? 'text-red-600' : breakdown.textColor}`}>
                      {breakdown.label}
                    </p>
                    <p className="text-xs font-medium text-slate-500 mt-1">
                      {breakdown.stopCount} stop{breakdown.stopCount !== 1 ? 's' : ''}
                    </p>
                  </button>

                  {/* Expanded Details */}
                  {expandedCategory === breakdown.category && (
                    <div className={`mt-3 rounded-xl border-2 ${breakdown.borderColor} bg-white overflow-hidden shadow-md`}>
                      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                        <p className="text-sm font-semibold text-slate-700">
                          {breakdown.label} - {formatDurationLong(breakdown.totalMinutes)} total
                        </p>
                      </div>
                      <div className="max-h-72 overflow-y-auto">
                        {breakdown.stops.map((stop, idx) => (
                          <div
                            key={stop.id}
                            className={`px-4 py-3 flex items-start gap-3 transition-colors hover:bg-slate-50 ${
                              idx !== breakdown.stops.length - 1 ? 'border-b border-slate-100' : ''
                            } ${stop.durationMinutes >= 45 ? 'bg-red-50/50' : ''}`}
                          >
                            {stop.logoUrl ? (
                              <img
                                src={stop.logoUrl}
                                alt=""
                                className="w-10 h-10 object-contain flex-shrink-0 mt-0.5 rounded-lg"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className={`w-10 h-10 rounded-xl ${breakdown.bgColor} flex items-center justify-center flex-shrink-0 border ${breakdown.borderColor}`}>
                                <Clock className={`w-5 h-5 ${breakdown.textColor}`} />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-800 truncate">
                                {stop.name}
                              </p>
                              {stop.address && (
                                <p className="text-xs text-slate-500 truncate mt-0.5">
                                  {stop.address}
                                </p>
                              )}
                              <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-500 font-medium">
                                <span>{stop.date}</span>
                                <span className="text-slate-300">|</span>
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
                                  className="text-xs text-blue-600 hover:text-blue-800 font-semibold mt-1 transition-colors"
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

          {/* Violations Panel */}
          {violations.length > 0 && (
            <ViolationsPanel
              violations={violations}
              onExcuseViolation={handleExcuseViolation}
              onRemoveExcuse={handleRemoveExcuse}
            />
          )}

          {/* Timeline List */}
          <div className="space-y-6">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
              Day-by-Day Timeline
            </h3>
            {timelines.map((timeline) => (
              <DayTimelineComponent
                key={timeline.date}
                timeline={timeline}
                onShowMapLocation={handleShowMapLocation}
                onLabelLocation={handleLabelLocation}
                onAssignJob={handleOpenAssignJob}
                onAnnotatePunch={handleOpenAnnotation}
                onAddMissingPunch={handleOpenProposedPunch}
                annotationCounts={annotationCounts}
              />
            ))}
          </div>
        </>
      )}

      {/* Map Modal */}
      {mapLocation && (
        <GoogleMapsModal
          isOpen={mapModalOpen}
          onClose={() => {
            setMapModalOpen(false);
            setMapLocation(null);
          }}
          latitude={mapLocation.latitude}
          longitude={mapLocation.longitude}
          label={mapLocation.label}
          address={mapLocation.address}
          technicianName={selectedTech?.name}
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

      {/* Assign Job Modal */}
      {assignJobData && selectedTech && (
        <AssignJobModal
          isOpen={assignJobModalOpen}
          onClose={() => {
            setAssignJobModalOpen(false);
            setAssignJobData(null);
          }}
          technicianId={assignJobData.technicianId}
          technicianName={selectedTech.name}
          date={assignJobData.date}
          latitude={assignJobData.latitude}
          longitude={assignJobData.longitude}
          timestamp={assignJobData.timestamp}
          address={assignJobData.address}
          onAssign={handleAssignJob}
        />
      )}

      {/* Punch Annotation Modal */}
      {annotationData && (
        <PunchAnnotationModal
          isOpen={annotationModalOpen}
          onClose={() => {
            setAnnotationModalOpen(false);
            setAnnotationData(null);
          }}
          punchRecordId={annotationData.punchRecordId}
          punchType={annotationData.punchType}
          punchTime={annotationData.punchTime}
          gpsLocationType={annotationData.gpsLocationType}
          address={annotationData.address}
          isViolation={annotationData.isViolation}
          violationReason={annotationData.violationReason}
          onAnnotationAdded={fetchAnnotationCounts}
        />
      )}

      {/* Proposed Punch Modal */}
      {proposedPunchData && (
        <ProposedPunchModal
          isOpen={proposedPunchModalOpen}
          onClose={() => {
            setProposedPunchModalOpen(false);
            setProposedPunchData(null);
          }}
          technicianId={proposedPunchData.technicianId}
          technicianName={proposedPunchData.technicianName}
          date={proposedPunchData.date}
          onPunchAdded={fetchTimelines}
        />
      )}
    </main>
  );
}
