'use client';

import { useState, useCallback } from 'react';
import { ChevronDown, ChevronUp, RefreshCw, AlertTriangle, Clock, List } from 'lucide-react';
import DayJobsTable from './DayJobsTable';
import DayTimeline from './DayTimeline';
import { TechnicianDayDetails, JobDetail } from '@/types/reports';
import { DayTimeline as DayTimelineType } from '@/types/timeline';

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

interface ExpandableTechnicianRowProps {
  technician: TechnicianStats;
  expanded: boolean;
  onToggle: () => void;
  dayDetails: TechnicianDayDetails | null;
  loading: boolean;
  onShowGpsLocation: (job: JobDetail, technicianName: string) => void;
}

export default function ExpandableTechnicianRow({
  technician,
  expanded,
  onToggle,
  dayDetails,
  loading,
  onShowGpsLocation,
}: ExpandableTechnicianRowProps) {
  // View mode: 'jobs' for old table view, 'timeline' for new timeline view
  const [viewMode, setViewMode] = useState<'jobs' | 'timeline'>('timeline');

  // Timeline data cache: date -> timeline
  const [timelines, setTimelines] = useState<Record<string, DayTimelineType>>({});
  const [loadingTimelines, setLoadingTimelines] = useState<Record<string, boolean>>({});

  // Fetch timeline for a specific date
  const fetchTimeline = useCallback(async (date: string) => {
    if (timelines[date] || loadingTimelines[date]) return;

    setLoadingTimelines(prev => ({ ...prev, [date]: true }));

    try {
      const response = await fetch(
        `/api/reports/technician-timeline?technicianId=${technician.id}&date=${date}`
      );
      const data = await response.json();

      if (data.success && data.timeline) {
        setTimelines(prev => ({ ...prev, [date]: data.timeline }));
      }
    } catch (error) {
      console.error('Error fetching timeline:', error);
    } finally {
      setLoadingTimelines(prev => ({ ...prev, [date]: false }));
    }
  }, [technician.id, timelines, loadingTimelines]);

  // Handle GPS location click from timeline
  const handleTimelineGpsClick = useCallback((jobId: string, jobNumber: string) => {
    // Find the job in dayDetails to pass to the parent handler
    if (dayDetails) {
      for (const day of dayDetails.days) {
        const job = day.jobs.find(j => j.id === jobId);
        if (job) {
          onShowGpsLocation(job, technician.name);
          return;
        }
      }
    }
  }, [dayDetails, onShowGpsLocation, technician.name]);

  return (
    <>
      {/* Main Row */}
      <tr
        onClick={onToggle}
        className={`hover:bg-gray-50 cursor-pointer ${expanded ? 'bg-blue-50' : ''}`}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
            <span className="font-medium text-gray-900">{technician.name}</span>
            {technician.hasInaccurateData && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-orange-100 text-orange-700"
                title={`${technician.unverifiedFirstJobs} of ${technician.totalFirstJobs} jobs missing GPS data`}
              >
                <AlertTriangle className="w-3 h-3" />
                {technician.unverifiedFirstJobs} unverified
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-center text-gray-900">
          {technician.totalFirstJobs}
        </td>
        <td className="px-4 py-3 text-center">
          <span
            className={`inline-flex items-center px-2 py-1 rounded text-sm font-medium ${
              technician.lateFirstJobs === 0
                ? 'bg-green-100 text-green-700'
                : technician.lateFirstJobs <= 2
                ? 'bg-yellow-100 text-yellow-700'
                : 'bg-red-100 text-red-700'
            }`}
          >
            {technician.lateFirstJobs}
          </span>
        </td>
        <td className="px-4 py-3 text-center">
          {technician.onTimePercentage !== null ? (
            <div className="flex items-center justify-center gap-2">
              <div className="w-16 bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${
                    technician.onTimePercentage >= 90
                      ? 'bg-green-500'
                      : technician.onTimePercentage >= 75
                      ? 'bg-yellow-500'
                      : 'bg-red-500'
                  }`}
                  style={{ width: `${technician.onTimePercentage}%` }}
                />
              </div>
              <span className="text-sm text-gray-900">{technician.onTimePercentage}%</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-1">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              <span className="text-sm text-orange-600 font-medium">No GPS Data</span>
            </div>
          )}
        </td>
        <td className="px-4 py-3 text-center text-gray-900">
          {technician.avgLateMinutes > 0 ? `${technician.avgLateMinutes}m` : '-'}
        </td>
      </tr>

      {/* Expanded Content */}
      {expanded && (
        <tr>
          <td colSpan={5} className="px-4 py-4 bg-gray-50 border-t">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
                <span className="ml-2 text-gray-500">Loading job details...</span>
              </div>
            ) : dayDetails && dayDetails.days.length > 0 ? (
              <div className="space-y-2">
                {/* Header with view toggle */}
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-gray-700">
                    Day-by-Day Breakdown ({dayDetails.days.length} day{dayDetails.days.length !== 1 ? 's' : ''})
                  </h4>

                  {/* View Mode Toggle */}
                  <div className="flex items-center gap-1 bg-gray-200 rounded-lg p-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewMode('timeline');
                      }}
                      className={`flex items-center gap-1 px-3 py-1 rounded text-sm transition-colors ${
                        viewMode === 'timeline'
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      <Clock className="w-4 h-4" />
                      Timeline
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewMode('jobs');
                      }}
                      className={`flex items-center gap-1 px-3 py-1 rounded text-sm transition-colors ${
                        viewMode === 'jobs'
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      <List className="w-4 h-4" />
                      Jobs
                    </button>
                  </div>
                </div>

                {/* Days list */}
                {dayDetails.days.map((day) => {
                  if (viewMode === 'timeline') {
                    // Timeline view - fetch on demand
                    const timeline = timelines[day.date];
                    const isLoadingTimeline = loadingTimelines[day.date];

                    // Trigger fetch if not loaded
                    if (!timeline && !isLoadingTimeline) {
                      fetchTimeline(day.date);
                    }

                    if (isLoadingTimeline) {
                      return (
                        <div key={day.date} className="border rounded-lg overflow-hidden bg-gray-50 mb-3">
                          <div className="px-4 py-2 bg-gray-100 border-b">
                            <span className="font-medium text-gray-900">{day.date}</span>
                            <span className="text-gray-500 ml-2">({day.dayOfWeek})</span>
                          </div>
                          <div className="flex items-center justify-center py-8">
                            <RefreshCw className="w-5 h-5 text-gray-400 animate-spin" />
                            <span className="ml-2 text-gray-500 text-sm">Loading timeline...</span>
                          </div>
                        </div>
                      );
                    }

                    if (timeline) {
                      return (
                        <DayTimeline
                          key={day.date}
                          timeline={timeline}
                          onShowGpsLocation={handleTimelineGpsClick}
                        />
                      );
                    }

                    // Fallback while waiting for fetch to trigger
                    return (
                      <div key={day.date} className="border rounded-lg overflow-hidden bg-gray-50 mb-3">
                        <div className="px-4 py-2 bg-gray-100 border-b">
                          <span className="font-medium text-gray-900">{day.date}</span>
                          <span className="text-gray-500 ml-2">({day.dayOfWeek})</span>
                        </div>
                        <div className="p-4 text-gray-500 text-sm">
                          Loading...
                        </div>
                      </div>
                    );
                  } else {
                    // Jobs table view (original)
                    return (
                      <DayJobsTable
                        key={day.date}
                        date={day.date}
                        dayOfWeek={day.dayOfWeek}
                        jobs={day.jobs}
                        officeVisits={day.officeVisits}
                        onShowGpsLocation={(job) => onShowGpsLocation(job, technician.name)}
                      />
                    );
                  }
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                No job details available for this period
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
