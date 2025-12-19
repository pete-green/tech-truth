'use client';

import { useState, useEffect, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import {
  Clock,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Users,
  Calendar,
  Filter,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import AnnotationsReviewPanel from '@/components/AnnotationsReviewPanel';

interface Technician {
  id: string;
  name: string;
  st_technician_id: number;
}

interface Job {
  id: string;
  job_number: string;
  customer_name: string;
  job_address: string;
  scheduled_start: string;
  actual_arrival: string;
}

interface Discrepancy {
  id: string;
  job_date: string;
  scheduled_arrival: string;
  actual_arrival: string;
  variance_minutes: number;
  is_late: boolean;
  is_first_job: boolean;
  reviewed: boolean;
  notes: string | null;
  technician: Technician;
  job: Job;
}

export default function Dashboard() {
  const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [firstJobOnly, setFirstJobOnly] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Initialize date on client side only to prevent hydration mismatch
  useEffect(() => {
    setSelectedDate(format(new Date(), 'yyyy-MM-dd'));
  }, []);

  const fetchDiscrepancies = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        date: selectedDate,
        firstJobOnly: String(firstJobOnly),
      });

      const response = await fetch(`/api/discrepancies?${params}`);
      const data = await response.json();

      if (!response.ok) throw new Error(data.error);

      setDiscrepancies(data.discrepancies || []);
    } catch (err: any) {
      setError(err.message);
    }
  }, [selectedDate, firstJobOnly]);

  useEffect(() => {
    // Don't fetch until date is initialized
    if (!selectedDate) return;

    const loadData = async () => {
      setLoading(true);
      await fetchDiscrepancies();
      setLoading(false);
    };

    loadData();
  }, [fetchDiscrepancies, selectedDate]);

  // Set up real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('discrepancies-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'arrival_discrepancies',
        },
        () => {
          fetchDiscrepancies();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchDiscrepancies]);

  const handleMarkReviewed = async (id: string) => {
    try {
      const response = await fetch('/api/discrepancies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, reviewed: true }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error);
      }

      await fetchDiscrepancies();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const formatTime = (isoString: string) => {
    return format(parseISO(isoString), 'h:mm a');
  };

  const formatVariance = (minutes: number) => {
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours}h ${mins}m late`;
    }
    return `${minutes}m late`;
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Error Alert */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="w-5 h-5" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)}>
            <X className="w-5 h-5 text-red-500" />
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-sm p-4 border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {discrepancies.filter((d) => d.is_first_job).length}
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
                {discrepancies.length > 0
                  ? Math.round(
                      discrepancies.reduce((sum, d) => sum + d.variance_minutes, 0) /
                        discrepancies.length
                    )
                  : 0}
                m
              </p>
              <p className="text-sm text-gray-500">Avg Late Time</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4 border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {new Set(discrepancies.map((d) => d.technician?.id)).size}
              </p>
              <p className="text-sm text-gray-500">Techs Late Today</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4 border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {discrepancies.filter((d) => d.reviewed).length}
              </p>
              <p className="text-sm text-gray-500">Reviewed</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-400" />
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={firstJobOnly}
                onChange={(e) => setFirstJobOnly(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">First jobs only</span>
            </label>
          </div>
        </div>
      </div>

      {/* Discrepancies Table */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50">
          <h2 className="font-semibold text-gray-900">
            Arrival Discrepancies - {selectedDate ? format(parseISO(selectedDate), 'MMMM d, yyyy') : 'Loading...'}
          </h2>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-2" />
            <p className="text-gray-500">Loading discrepancies...</p>
          </div>
        ) : discrepancies.length === 0 ? (
          <div className="p-8 text-center">
            <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-2" />
            <p className="text-gray-500">No late arrivals found for this date</p>
            <p className="text-sm text-gray-400 mt-1">
              Click &quot;Sync Data&quot; to check for new data
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Technician
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Job
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Scheduled
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Arrived
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Variance
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {discrepancies.map((disc) => (
                  <>
                    <tr
                      key={disc.id}
                      className={`hover:bg-gray-50 cursor-pointer ${
                        disc.is_first_job ? 'bg-red-50' : ''
                      }`}
                      onClick={() => toggleRow(disc.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {expandedRows.has(disc.id) ? (
                            <ChevronUp className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          )}
                          <div>
                            <p className="font-medium text-gray-900">
                              {disc.technician?.name || 'Unknown'}
                            </p>
                            {disc.is_first_job && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                                First Job
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-900">
                          {disc.job?.job_number || 'N/A'}
                        </p>
                        <p className="text-xs text-gray-500 truncate max-w-[200px]">
                          {disc.job?.customer_name || ''}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {formatTime(disc.scheduled_arrival)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {formatTime(disc.actual_arrival)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded text-sm font-medium ${
                            disc.variance_minutes >= 30
                              ? 'bg-red-100 text-red-700'
                              : disc.variance_minutes >= 15
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-orange-100 text-orange-700'
                          }`}
                        >
                          {formatVariance(disc.variance_minutes)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {disc.reviewed ? (
                          <span className="inline-flex items-center gap-1 text-sm text-green-600">
                            <CheckCircle className="w-4 h-4" />
                            Reviewed
                          </span>
                        ) : (
                          <span className="text-sm text-gray-500">Pending</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!disc.reviewed && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMarkReviewed(disc.id);
                            }}
                            className="text-sm text-blue-600 hover:text-blue-800"
                          >
                            Mark Reviewed
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandedRows.has(disc.id) && (
                      <tr className="bg-gray-50">
                        <td colSpan={7} className="px-4 py-3">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-gray-500">Job Address</p>
                              <p className="text-gray-900">
                                {disc.job?.job_address || 'Not available'}
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-500">Notes</p>
                              <p className="text-gray-900">{disc.notes || 'No notes'}</p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Annotations Review Panel */}
      <div className="mt-6">
        <AnnotationsReviewPanel />
      </div>
    </main>
  );
}
