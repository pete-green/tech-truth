'use client';

import { useState, useEffect, useCallback } from 'react';
import { format, subDays, parseISO } from 'date-fns';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  Users,
  Clock,
  AlertTriangle,
  CheckCircle,
  Download,
  RefreshCw,
  Building,
} from 'lucide-react';
import TechnicianFilter from '@/components/TechnicianFilter';
import ExpandableTechnicianRow from '@/components/ExpandableTechnicianRow';
import GpsLocationModal from '@/components/GpsLocationModal';
import SimpleMapModal from '@/components/SimpleMapModal';
import LabelLocationModal from '@/components/LabelLocationModal';
import { TechnicianFilterItem, TechnicianDayDetails, JobDetail, GpsModalState } from '@/types/reports';
import { LocationCategory } from '@/types/custom-location';

interface SimpleMapModalState {
  isOpen: boolean;
  latitude: number;
  longitude: number;
  label: string;
  address?: string;
  technicianName: string;
}

interface LabelLocationModalState {
  isOpen: boolean;
  latitude: number;
  longitude: number;
  address: string;
}

interface TechnicianStats {
  id: string;
  name: string;
  totalFirstJobs: number;
  verifiedFirstJobs: number;
  unverifiedFirstJobs: number;
  lateFirstJobs: number;
  onTimePercentage: number | null;
  avgLateMinutes: number;
  trend: 'improving' | 'declining' | 'stable';
  hasInaccurateData: boolean;
}

interface DayOfWeekStats {
  total: number;
  late: number;
  percentage: number | null;
}

interface DailyTrend {
  date: string;
  totalLate: number;
  avgVariance: number;
}

interface OfficeVisitTechSummary {
  technicianId: string;
  technicianName: string;
  visitCount: number;
  totalMinutes: number;
  unnecessaryCount: number;
}

interface OfficeVisitSummary {
  totalMidDayVisits: number;
  totalMinutesAtOffice: number;
  totalUnnecessaryVisits: number;
  techsWithMostVisits: OfficeVisitTechSummary[];
}

interface ReportData {
  period: {
    start: string;
    end: string;
    totalDays: number;
  };
  summary: {
    totalFirstJobs: number;
    verifiedFirstJobs: number;
    unverifiedFirstJobs: number;
    lateFirstJobs: number;
    onTimeFirstJobs: number;
    onTimePercentage: number | null;
    avgLateMinutes: number;
    maxLateMinutes: number;
  };
  byTechnician: TechnicianStats[];
  byDayOfWeek: Record<string, DayOfWeekStats>;
  dailyTrend: DailyTrend[];
  availableTechnicians: TechnicianFilterItem[];
  officeVisitSummary?: OfficeVisitSummary;
}

export default function ReportsPage() {
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<'7' | '14' | '30' | 'custom'>('30');
  const [customStartDate, setCustomStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [customEndDate, setCustomEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [mounted, setMounted] = useState(false);

  // Technician filtering
  const [selectedTechnicianIds, setSelectedTechnicianIds] = useState<Set<string>>(new Set());
  const [allTechnicians, setAllTechnicians] = useState<TechnicianFilterItem[]>([]); // Full list for filter panel
  const [initialLoad, setInitialLoad] = useState(true);

  // Expanded rows
  const [expandedTechnicianIds, setExpandedTechnicianIds] = useState<Set<string>>(new Set());
  const [technicianDetails, setTechnicianDetails] = useState<Map<string, TechnicianDayDetails>>(new Map());
  const [loadingDetails, setLoadingDetails] = useState<Set<string>>(new Set());

  // GPS Modal
  const [gpsModal, setGpsModal] = useState<GpsModalState | null>(null);

  // Simple Map Modal (for unknown locations, office visits, etc.)
  const [simpleMapModal, setSimpleMapModal] = useState<SimpleMapModalState | null>(null);

  // Label Location Modal
  const [labelLocationModal, setLabelLocationModal] = useState<LabelLocationModalState | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const getDateRange = useCallback(() => {
    let startDate: string;
    let endDate = format(new Date(), 'yyyy-MM-dd');

    if (dateRange === 'custom') {
      startDate = customStartDate;
      endDate = customEndDate;
    } else {
      startDate = format(subDays(new Date(), parseInt(dateRange)), 'yyyy-MM-dd');
    }

    return { startDate, endDate };
  }, [dateRange, customStartDate, customEndDate]);

  const fetchReport = useCallback(async (techIds?: Set<string>) => {
    if (!mounted) return;

    setLoading(true);
    setError(null);

    try {
      const { startDate, endDate } = getDateRange();

      let url = `/api/reports?startDate=${startDate}&endDate=${endDate}`;

      // Add technician filter if not initial load and we have selections
      if (!initialLoad && techIds && techIds.size > 0) {
        url += `&technicianIds=${Array.from(techIds).join(',')}`;
      }

      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok) throw new Error(data.error);

      setReportData(data);

      // On initial load (or date range change), save full technician list and select all
      if (initialLoad && data.availableTechnicians) {
        setAllTechnicians(data.availableTechnicians);
        setSelectedTechnicianIds(new Set(data.availableTechnicians.map((t: TechnicianFilterItem) => t.id)));
        setInitialLoad(false);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getDateRange, mounted, initialLoad]);

  useEffect(() => {
    // Reset to initial state when date range changes
    setInitialLoad(true);
    setSelectedTechnicianIds(new Set());
    setAllTechnicians([]);
    setExpandedTechnicianIds(new Set());
    setTechnicianDetails(new Map());
    fetchReport();
  }, [dateRange, customStartDate, customEndDate, mounted]);

  // Refetch when technician selection changes (after initial load)
  const handleTechnicianSelectionChange = useCallback((newSelection: Set<string>) => {
    setSelectedTechnicianIds(newSelection);

    // Clear expanded rows and cached details when filter changes
    setExpandedTechnicianIds(new Set());
    setTechnicianDetails(new Map());

    // Refetch with new selection
    if (!initialLoad) {
      fetchReport(newSelection);
    }
  }, [fetchReport, initialLoad]);

  const fetchTechnicianDetails = async (technicianId: string) => {
    const { startDate, endDate } = getDateRange();

    setLoadingDetails((prev) => new Set(prev).add(technicianId));

    try {
      const response = await fetch(
        `/api/reports/technician-details?technicianId=${technicianId}&startDate=${startDate}&endDate=${endDate}`
      );
      const data = await response.json();

      if (!response.ok) throw new Error(data.error);

      setTechnicianDetails((prev) => {
        const newMap = new Map(prev);
        newMap.set(technicianId, data);
        return newMap;
      });
    } catch (err: any) {
      console.error('Error fetching technician details:', err);
    } finally {
      setLoadingDetails((prev) => {
        const newSet = new Set(prev);
        newSet.delete(technicianId);
        return newSet;
      });
    }
  };

  const toggleExpanded = (technicianId: string) => {
    setExpandedTechnicianIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(technicianId)) {
        newSet.delete(technicianId);
      } else {
        newSet.add(technicianId);
        // Fetch details if not already cached
        if (!technicianDetails.has(technicianId)) {
          fetchTechnicianDetails(technicianId);
        }
      }
      return newSet;
    });
  };

  const handleShowGpsLocation = (job: JobDetail, technicianName: string) => {
    const tech = reportData?.byTechnician.find((t) => t.name === technicianName);
    if (!tech) return;

    setGpsModal({
      isOpen: true,
      technicianName,
      jobDate: job.scheduledStart.split('T')[0],
      scheduledTime: job.scheduledStart,
      jobId: job.id,
      technicianId: tech.id,
      data: null,
      loading: true,
      error: null,
    });
  };

  const handleShowMapLocation = (
    location: { latitude: number; longitude: number; label: string; address?: string },
    technicianName: string
  ) => {
    setSimpleMapModal({
      isOpen: true,
      latitude: location.latitude,
      longitude: location.longitude,
      label: location.label,
      address: location.address,
      technicianName,
    });
  };

  const handleLabelLocation = (location: { latitude: number; longitude: number; address: string }) => {
    setLabelLocationModal({
      isOpen: true,
      latitude: location.latitude,
      longitude: location.longitude,
      address: location.address,
    });
  };

  const handleSaveCustomLocation = async (data: {
    name: string;
    category: LocationCategory;
    logoUrl?: string;
    radiusFeet: number;
  }) => {
    if (!labelLocationModal) return;

    const response = await fetch('/api/custom-locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: data.name,
        category: data.category,
        logoUrl: data.logoUrl,
        centerLatitude: labelLocationModal.latitude,
        centerLongitude: labelLocationModal.longitude,
        radiusFeet: data.radiusFeet,
        address: labelLocationModal.address,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to save location');
    }

    // Clear cached timeline data so it will be reloaded with new custom location
    setTechnicianDetails(new Map());
  };

  const exportToCSV = () => {
    if (!reportData) return;

    const headers = ['Technician', 'Total First Jobs', 'Verified Jobs', 'Unverified Jobs', 'Late First Jobs', 'On-Time %', 'Avg Late (min)', 'Data Status'];
    const rows = reportData.byTechnician.map(t => [
      t.name,
      t.totalFirstJobs,
      t.verifiedFirstJobs,
      t.unverifiedFirstJobs,
      t.lateFirstJobs,
      t.onTimePercentage !== null ? `${t.onTimePercentage}%` : 'N/A',
      t.avgLateMinutes,
      t.hasInaccurateData ? 'Incomplete GPS Data' : 'Complete',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tech-truth-report-${reportData.period.start}-to-${reportData.period.end}.csv`;
    a.click();
  };

  const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const dayLabels: Record<string, string> = {
    monday: 'Mon',
    tuesday: 'Tue',
    wednesday: 'Wed',
    thursday: 'Thu',
    friday: 'Fri',
    saturday: 'Sat',
    sunday: 'Sun',
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="w-5 h-5" />
                Back
              </Link>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Performance Reports</h1>
                <p className="text-sm text-gray-500">Technician arrival analysis</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={exportToCSV}
                disabled={!reportData}
                className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 border rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
              <button
                onClick={() => fetchReport(selectedTechnicianIds)}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Date Range Selector */}
        <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-gray-400" />
              <span className="text-sm font-medium text-gray-700">Date Range:</span>
            </div>
            <div className="flex gap-2">
              {(['7', '14', '30'] as const).map((days) => (
                <button
                  key={days}
                  onClick={() => setDateRange(days)}
                  className={`px-3 py-1.5 text-sm rounded-lg ${
                    dateRange === days
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Last {days} days
                </button>
              ))}
              <button
                onClick={() => setDateRange('custom')}
                className={`px-3 py-1.5 text-sm rounded-lg ${
                  dateRange === 'custom'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Custom
              </button>
            </div>
            {dateRange === 'custom' && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="border rounded-lg px-3 py-1.5 text-sm"
                />
                <span className="text-gray-500">to</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="border rounded-lg px-3 py-1.5 text-sm"
                />
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            {error}
          </div>
        )}

        {loading && !reportData ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 text-gray-400 animate-spin" />
          </div>
        ) : reportData ? (
          <div className="flex gap-6">
            {/* Left Column - Technician Filter */}
            <div className="w-64 flex-shrink-0">
              <TechnicianFilter
                technicians={allTechnicians}
                selectedIds={selectedTechnicianIds}
                onSelectionChange={handleTechnicianSelectionChange}
                loading={loading}
              />
            </div>

            {/* Right Column - Reports Content */}
            <div className="flex-1 min-w-0">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white rounded-lg shadow-sm p-4 border">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Users className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">
                        {reportData.summary.totalFirstJobs}
                      </p>
                      <p className="text-sm text-gray-500">Total First Jobs</p>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-lg shadow-sm p-4 border">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      reportData.summary.onTimePercentage !== null ? 'bg-green-100' : 'bg-orange-100'
                    }`}>
                      {reportData.summary.onTimePercentage !== null ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-orange-600" />
                      )}
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">
                        {reportData.summary.onTimePercentage !== null
                          ? `${reportData.summary.onTimePercentage}%`
                          : 'N/A'}
                      </p>
                      <p className="text-sm text-gray-500">
                        On-Time Rate
                        {reportData.summary.verifiedFirstJobs > 0 && reportData.summary.unverifiedFirstJobs > 0 && (
                          <span className="text-orange-600 ml-1">
                            ({reportData.summary.verifiedFirstJobs} verified)
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-lg shadow-sm p-4 border">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                      <AlertTriangle className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">
                        {reportData.summary.lateFirstJobs}
                      </p>
                      <p className="text-sm text-gray-500">Late First Jobs</p>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-lg shadow-sm p-4 border">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                      <Clock className="w-5 h-5 text-yellow-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">
                        {reportData.summary.avgLateMinutes}m
                      </p>
                      <p className="text-sm text-gray-500">Avg Late Time</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Office Visit Summary Card */}
              {reportData.officeVisitSummary && reportData.officeVisitSummary.totalMidDayVisits > 0 && (
                <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                        <Building className="w-5 h-5 text-purple-600" />
                      </div>
                      <div>
                        <h2 className="font-semibold text-gray-900">Office Visits During Work Hours</h2>
                        <p className="text-sm text-gray-500">
                          {reportData.officeVisitSummary.totalMidDayVisits} mid-day visits
                          {reportData.officeVisitSummary.totalUnnecessaryVisits > 0 && (
                            <span className="text-amber-600 ml-1" title="Take-home truck techs who went to office before their first job">
                              ({reportData.officeVisitSummary.totalUnnecessaryVisits} unnecessary)
                            </span>
                          )}
                          {reportData.officeVisitSummary.totalMinutesAtOffice > 0 && (
                            <span className="text-purple-600 ml-1">
                              - {Math.round(reportData.officeVisitSummary.totalMinutesAtOffice / 60)}h {reportData.officeVisitSummary.totalMinutesAtOffice % 60}m total
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  {reportData.officeVisitSummary.techsWithMostVisits.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Technician</th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Visits</th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                              <span title="Unnecessary visits - take-home truck went to office before first job">Unnecessary</span>
                            </th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Total Time</th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Avg/Visit</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {reportData.officeVisitSummary.techsWithMostVisits.slice(0, 5).map((tech) => (
                            <tr key={tech.technicianId} className="hover:bg-gray-50">
                              <td className="px-3 py-2 font-medium text-gray-900">{tech.technicianName}</td>
                              <td className="px-3 py-2 text-center">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                  {tech.visitCount}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-center">
                                {tech.unnecessaryCount > 0 ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                                    <AlertTriangle className="w-3 h-3" />
                                    {tech.unnecessaryCount}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-center text-gray-600">
                                {tech.totalMinutes >= 60
                                  ? `${Math.floor(tech.totalMinutes / 60)}h ${tech.totalMinutes % 60}m`
                                  : `${tech.totalMinutes}m`}
                              </td>
                              <td className="px-3 py-2 text-center text-gray-600">
                                {tech.visitCount > 0 ? Math.round(tech.totalMinutes / tech.visitCount) : 0}m
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Day of Week Analysis */}
              <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
                <h2 className="font-semibold text-gray-900 mb-4">On-Time Rate by Day of Week</h2>
                <div className="grid grid-cols-7 gap-2">
                  {dayNames.map((day) => {
                    const stats = reportData.byDayOfWeek[day];
                    const percentage = stats.percentage;
                    const hasData = percentage !== null && stats.total > 0;
                    const bgColor = !hasData
                      ? 'bg-gray-100'
                      : percentage >= 90 ? 'bg-green-100' : percentage >= 75 ? 'bg-yellow-100' : 'bg-red-100';
                    const textColor = !hasData
                      ? 'text-gray-400'
                      : percentage >= 90 ? 'text-green-700' : percentage >= 75 ? 'text-yellow-700' : 'text-red-700';

                    return (
                      <div key={day} className={`p-3 rounded-lg ${bgColor} text-center`}>
                        <p className="text-xs font-medium text-gray-600">{dayLabels[day]}</p>
                        <p className={`text-lg font-bold ${textColor}`}>
                          {hasData ? `${percentage}%` : '-'}
                        </p>
                        <p className="text-xs text-gray-500">{stats.total} jobs</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Technician Performance Table */}
              <div className="bg-white rounded-lg shadow-sm border overflow-hidden mb-6">
                <div className="px-4 py-3 border-b bg-gray-50">
                  <h2 className="font-semibold text-gray-900">
                    Technician Performance
                    <span className="text-sm font-normal text-gray-500 ml-2">
                      (click to expand day-by-day details)
                    </span>
                  </h2>
                </div>
                {reportData.byTechnician.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    No data available for this period
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Technician
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                            First Jobs
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                            Late
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                            On-Time %
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                            Avg Late
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {reportData.byTechnician.map((tech) => (
                          <ExpandableTechnicianRow
                            key={tech.id}
                            technician={tech}
                            expanded={expandedTechnicianIds.has(tech.id)}
                            onToggle={() => toggleExpanded(tech.id)}
                            dayDetails={technicianDetails.get(tech.id) || null}
                            loading={loadingDetails.has(tech.id)}
                            onShowGpsLocation={handleShowGpsLocation}
                            onShowMapLocation={handleShowMapLocation}
                            onLabelLocation={handleLabelLocation}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Daily Trend */}
              {reportData.dailyTrend.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm border p-4">
                  <h2 className="font-semibold text-gray-900 mb-4">Daily Late Arrivals</h2>
                  <div className="h-32 flex items-end gap-1">
                    {reportData.dailyTrend.map((day) => {
                      const maxLate = Math.max(...reportData.dailyTrend.map(d => d.totalLate));
                      const height = maxLate > 0 ? (day.totalLate / maxLate) * 100 : 0;

                      return (
                        <div
                          key={day.date}
                          className="flex-1 bg-red-400 rounded-t hover:bg-red-500 transition-colors"
                          style={{ height: `${Math.max(height, 5)}%` }}
                          title={`${format(parseISO(day.date), 'MMM d')}: ${day.totalLate} late (avg ${day.avgVariance}m)`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-2">
                    <span>{reportData.period.start}</span>
                    <span>{reportData.period.end}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </main>

      {/* GPS Location Modal */}
      {gpsModal && (
        <GpsLocationModal
          isOpen={gpsModal.isOpen}
          onClose={() => setGpsModal(null)}
          technicianName={gpsModal.technicianName}
          jobDate={gpsModal.jobDate}
          scheduledTime={gpsModal.scheduledTime}
          technicianId={gpsModal.technicianId}
          jobId={gpsModal.jobId}
        />
      )}

      {/* Simple Map Modal (for unknown locations, etc.) */}
      {simpleMapModal && (
        <SimpleMapModal
          isOpen={simpleMapModal.isOpen}
          onClose={() => setSimpleMapModal(null)}
          latitude={simpleMapModal.latitude}
          longitude={simpleMapModal.longitude}
          label={simpleMapModal.label}
          address={simpleMapModal.address}
          technicianName={simpleMapModal.technicianName}
        />
      )}

      {/* Label Location Modal */}
      {labelLocationModal && (
        <LabelLocationModal
          isOpen={labelLocationModal.isOpen}
          onClose={() => setLabelLocationModal(null)}
          latitude={labelLocationModal.latitude}
          longitude={labelLocationModal.longitude}
          address={labelLocationModal.address}
          onSave={handleSaveCustomLocation}
        />
      )}
    </div>
  );
}
