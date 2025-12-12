'use client';

import { ChevronDown, ChevronUp, RefreshCw, AlertTriangle } from 'lucide-react';
import DayJobsTable from './DayJobsTable';
import { TechnicianDayDetails, JobDetail } from '@/types/reports';

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
                <h4 className="text-sm font-semibold text-gray-700 mb-3">
                  Day-by-Day Breakdown ({dayDetails.days.length} day{dayDetails.days.length !== 1 ? 's' : ''})
                </h4>
                {dayDetails.days.map((day) => (
                  <DayJobsTable
                    key={day.date}
                    date={day.date}
                    dayOfWeek={day.dayOfWeek}
                    jobs={day.jobs}
                    officeVisits={day.officeVisits}
                    onShowGpsLocation={(job) => onShowGpsLocation(job, technician.name)}
                  />
                ))}
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
