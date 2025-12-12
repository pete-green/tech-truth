'use client';

import { format, parseISO } from 'date-fns';
import { MapPin, Clock, AlertTriangle } from 'lucide-react';
import { JobDetail } from '@/types/reports';

interface DayJobsTableProps {
  date: string;
  dayOfWeek: string;
  jobs: JobDetail[];
  onShowGpsLocation: (job: JobDetail) => void;
}

export default function DayJobsTable({
  date,
  dayOfWeek,
  jobs,
  onShowGpsLocation,
}: DayJobsTableProps) {
  const formattedDate = format(parseISO(date), 'MMMM d, yyyy');

  return (
    <div className="border rounded-lg overflow-hidden bg-gray-50 mb-3">
      {/* Day Header */}
      <div className="px-4 py-2 bg-gray-100 border-b flex items-center justify-between">
        <div>
          <span className="font-medium text-gray-900">{formattedDate}</span>
          <span className="text-gray-500 ml-2">({dayOfWeek})</span>
        </div>
        <span className="text-sm text-gray-500">{jobs.length} job{jobs.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Jobs Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Job #
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Customer
              </th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                Scheduled
              </th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                Arrived
              </th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                Variance
              </th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {jobs.map((job) => {
              const isLate = job.isLate && job.isFirstJob;
              return (
                <tr
                  key={job.id}
                  className={isLate ? 'bg-red-50' : 'hover:bg-gray-50'}
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{job.jobNumber}</span>
                      {job.isFirstJob && (
                        <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                          First
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-gray-600 max-w-[150px] truncate">
                    {job.customerName || '-'}
                  </td>
                  <td className="px-3 py-2 text-center text-gray-900">
                    {job.scheduledStart
                      ? format(parseISO(job.scheduledStart), 'h:mm a')
                      : '-'}
                  </td>
                  <td className="px-3 py-2 text-center text-gray-900">
                    {job.actualArrival
                      ? format(parseISO(job.actualArrival), 'h:mm a')
                      : '-'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {job.varianceMinutes !== null ? (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                          job.varianceMinutes > 30
                            ? 'bg-red-100 text-red-700'
                            : job.varianceMinutes > 15
                            ? 'bg-yellow-100 text-yellow-700'
                            : job.varianceMinutes > 0
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-green-100 text-green-700'
                        }`}
                      >
                        {job.varianceMinutes > 0 && <AlertTriangle className="w-3 h-3" />}
                        {job.varianceMinutes > 0 ? '+' : ''}{job.varianceMinutes}m
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {job.isFirstJob && job.jobLatitude && job.jobLongitude && (
                      <button
                        onClick={() => onShowGpsLocation(job)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="View location on map"
                      >
                        <MapPin className="w-3 h-3" />
                        Map
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Address info (collapsed by default, could be expanded) */}
      {jobs.length > 0 && jobs[0].jobAddress && (
        <div className="px-4 py-2 border-t bg-gray-50 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            First job address: {jobs.find(j => j.isFirstJob)?.jobAddress || jobs[0].jobAddress}
          </div>
        </div>
      )}
    </div>
  );
}
