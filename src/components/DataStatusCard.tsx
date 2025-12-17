'use client';

import { useState, useEffect } from 'react';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Database,
  Truck,
  CreditCard,
} from 'lucide-react';

interface SyncHealth {
  lastSync: string | null;
  status: string;
  isHealthy: boolean;
  lastError: string | null;
  recentFailures?: number;
}

interface PunchDataStatus {
  date: string;
  technicianId: string;
  hasPunchData: boolean;
  hasClockIn: boolean;
  hasClockOut: boolean;
  punchCount: number;
}

interface DataStatusCardProps {
  technicianId: string;
  technicianName: string;
  date: string;
  onRefresh?: () => void;
}

export default function DataStatusCard({
  technicianId,
  technicianName,
  date,
  onRefresh,
}: DataStatusCardProps) {
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [syncHealth, setSyncHealth] = useState<{
    paylocity: SyncHealth;
    arrival: SyncHealth;
  } | null>(null);
  const [punchDataStatus, setPunchDataStatus] = useState<PunchDataStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      if (!technicianId || !date) return;

      setLoading(true);
      try {
        const response = await fetch(
          `/api/sync-status?technicianId=${technicianId}&date=${date}`
        );
        const data = await response.json();

        if (data.success) {
          setSyncHealth(data.syncHealth);
          setPunchDataStatus(data.punchDataStatus);
        } else {
          setError(data.error);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to fetch sync status');
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, [technicianId, date]);

  if (loading) {
    return (
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-2 text-gray-500">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="text-sm">Checking data status...</span>
        </div>
      </div>
    );
  }

  // Determine overall status
  const hasMissingPunchData = punchDataStatus && !punchDataStatus.hasPunchData;
  const hasMissingClockIn = punchDataStatus && punchDataStatus.hasPunchData && !punchDataStatus.hasClockIn;
  const hasMissingClockOut = punchDataStatus && punchDataStatus.hasPunchData && !punchDataStatus.hasClockOut;
  const paylocityUnhealthy = syncHealth && !syncHealth.paylocity.isHealthy;
  const hasIssues = hasMissingPunchData || hasMissingClockIn || hasMissingClockOut || paylocityUnhealthy;

  // If everything is healthy and we have data, show minimal indicator
  if (!hasIssues && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="bg-green-50 rounded-lg border border-green-200 p-3 mb-6 w-full text-left hover:bg-green-100 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm font-medium">Data Status: All Systems Healthy</span>
          </div>
          <ChevronDown className="w-4 h-4 text-green-600" />
        </div>
      </button>
    );
  }

  // Show warning card
  return (
    <div
      className={`rounded-lg border p-4 mb-6 ${
        hasIssues
          ? 'bg-amber-50 border-amber-300'
          : 'bg-green-50 border-green-200'
      }`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {hasIssues ? (
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            ) : (
              <CheckCircle className="w-5 h-5 text-green-600" />
            )}
            <span
              className={`font-medium ${
                hasIssues ? 'text-amber-800' : 'text-green-800'
              }`}
            >
              {hasIssues ? 'Data Issues Detected' : 'Data Status: All Systems Healthy'}
            </span>
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          )}
        </div>

        {/* Quick summary when collapsed */}
        {!expanded && hasIssues && (
          <div className="mt-2 flex flex-wrap gap-2">
            {hasMissingPunchData && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded text-xs">
                <XCircle className="w-3 h-3" />
                No punch data for {format(parseISO(date), 'MMM d')}
              </span>
            )}
            {hasMissingClockIn && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs">
                <Clock className="w-3 h-3" />
                Missing clock-in
              </span>
            )}
            {hasMissingClockOut && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs">
                <Clock className="w-3 h-3" />
                Missing clock-out
              </span>
            )}
            {paylocityUnhealthy && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded text-xs">
                <Database className="w-3 h-3" />
                Paylocity sync issue
              </span>
            )}
          </div>
        )}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-4 space-y-4">
          {/* Punch Data Status */}
          <div className="bg-white rounded-lg border p-3">
            <div className="flex items-center gap-2 mb-2">
              <CreditCard className="w-4 h-4 text-gray-600" />
              <span className="font-medium text-gray-800">
                Punch Data for {technicianName}
              </span>
            </div>
            <div className="text-sm space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Date:</span>
                <span className="text-gray-900">{format(parseISO(date), 'MMMM d, yyyy')}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Has punch data:</span>
                {punchDataStatus?.hasPunchData ? (
                  <span className="flex items-center gap-1 text-green-600">
                    <CheckCircle className="w-4 h-4" />
                    Yes ({punchDataStatus.punchCount} records)
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-red-600">
                    <XCircle className="w-4 h-4" />
                    No data found
                  </span>
                )}
              </div>
              {punchDataStatus?.hasPunchData && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Clock-in:</span>
                    {punchDataStatus.hasClockIn ? (
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle className="w-4 h-4" />
                        Found
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-amber-600">
                        <AlertTriangle className="w-4 h-4" />
                        Missing
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Clock-out:</span>
                    {punchDataStatus.hasClockOut ? (
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle className="w-4 h-4" />
                        Found
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-amber-600">
                        <AlertTriangle className="w-4 h-4" />
                        Missing
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Sync Status */}
          <div className="bg-white rounded-lg border p-3">
            <div className="flex items-center gap-2 mb-2">
              <Database className="w-4 h-4 text-gray-600" />
              <span className="font-medium text-gray-800">Sync Status</span>
            </div>
            <div className="text-sm space-y-2">
              {/* Paylocity */}
              <div className="flex items-center justify-between py-1 border-b">
                <span className="text-gray-600">Paylocity (punch data):</span>
                <div className="flex items-center gap-2">
                  {syncHealth?.paylocity.isHealthy ? (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  ) : syncHealth?.paylocity.status === 'failed' ? (
                    <XCircle className="w-4 h-4 text-red-600" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                  )}
                  <span className={syncHealth?.paylocity.isHealthy ? 'text-green-600' : 'text-amber-600'}>
                    {syncHealth?.paylocity.lastSync
                      ? formatDistanceToNow(parseISO(syncHealth.paylocity.lastSync), { addSuffix: true })
                      : 'Never synced'}
                  </span>
                </div>
              </div>
              {syncHealth?.paylocity.lastError && (
                <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
                  Last error: {syncHealth.paylocity.lastError}
                </div>
              )}

              {/* Arrival/GPS */}
              <div className="flex items-center justify-between py-1">
                <span className="text-gray-600">GPS/Arrival data:</span>
                <div className="flex items-center gap-2">
                  {syncHealth?.arrival.isHealthy ? (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                  )}
                  <span className={syncHealth?.arrival.isHealthy ? 'text-green-600' : 'text-amber-600'}>
                    {syncHealth?.arrival.lastSync
                      ? formatDistanceToNow(parseISO(syncHealth.arrival.lastSync), { addSuffix: true })
                      : 'Never synced'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Help text */}
          {hasMissingPunchData && (
            <div className="text-xs text-gray-600 bg-gray-100 p-2 rounded">
              <strong>Why is punch data missing?</strong>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>The technician may not have clocked in/out for this date</li>
                <li>Paylocity sync may have failed - check sync status above</li>
                <li>The technician may not be linked to a Paylocity employee ID</li>
              </ul>
            </div>
          )}

          {/* Refresh button */}
          {onRefresh && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRefresh();
              }}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh Timeline Data
            </button>
          )}
        </div>
      )}
    </div>
  );
}
