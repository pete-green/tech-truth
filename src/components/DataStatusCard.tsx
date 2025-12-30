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
      <div className="bg-gradient-to-r from-slate-50 to-slate-100 rounded-2xl border-2 border-slate-200 p-5 mb-6 shadow-sm">
        <div className="flex items-center gap-3 text-slate-500">
          <div className="p-2 bg-slate-200 rounded-xl">
            <RefreshCw className="w-4 h-4 animate-spin" />
          </div>
          <span className="text-sm font-medium">Checking data status...</span>
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
        className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl border-2 border-green-200 p-4 mb-6 w-full text-left hover:from-green-100 hover:to-emerald-100 transition-all shadow-sm hover:shadow-md"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-green-700">
            <div className="p-2 bg-green-500 rounded-xl shadow-sm">
              <CheckCircle className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-bold">Data Status: All Systems Healthy</span>
          </div>
          <ChevronDown className="w-5 h-5 text-green-600" />
        </div>
      </button>
    );
  }

  // Show warning card
  return (
    <div
      className={`rounded-2xl border-2 p-5 mb-6 shadow-md ${
        hasIssues
          ? 'bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-300'
          : 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200'
      }`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl shadow-sm ${hasIssues ? 'bg-amber-500' : 'bg-green-500'}`}>
              {hasIssues ? (
                <AlertTriangle className="w-4 h-4 text-white" />
              ) : (
                <CheckCircle className="w-4 h-4 text-white" />
              )}
            </div>
            <span
              className={`font-bold ${
                hasIssues ? 'text-amber-800' : 'text-green-800'
              }`}
            >
              {hasIssues ? 'Data Issues Detected' : 'Data Status: All Systems Healthy'}
            </span>
          </div>
          {expanded ? (
            <ChevronUp className="w-5 h-5 text-slate-500" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-500" />
          )}
        </div>

        {/* Quick summary when collapsed */}
        {!expanded && hasIssues && (
          <div className="mt-3 flex flex-wrap gap-2">
            {hasMissingPunchData && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-700 rounded-full text-xs font-bold">
                <XCircle className="w-3.5 h-3.5" />
                No punch data for {format(parseISO(date), 'MMM d')}
              </span>
            )}
            {hasMissingClockIn && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">
                <Clock className="w-3.5 h-3.5" />
                Missing clock-in
              </span>
            )}
            {hasMissingClockOut && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">
                <Clock className="w-3.5 h-3.5" />
                Missing clock-out
              </span>
            )}
            {paylocityUnhealthy && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-700 rounded-full text-xs font-bold">
                <Database className="w-3.5 h-3.5" />
                Paylocity sync issue
              </span>
            )}
          </div>
        )}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-5 space-y-4">
          {/* Punch Data Status */}
          <div className="bg-white rounded-xl border-2 border-slate-200 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 bg-slate-100 rounded-lg">
                <CreditCard className="w-4 h-4 text-slate-600" />
              </div>
              <span className="font-bold text-slate-800">
                Punch Data for {technicianName}
              </span>
            </div>
            <div className="text-sm space-y-2">
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-600 font-medium">Date:</span>
                <span className="text-slate-900 font-semibold">{format(parseISO(date), 'MMMM d, yyyy')}</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-600 font-medium">Has punch data:</span>
                {punchDataStatus?.hasPunchData ? (
                  <span className="flex items-center gap-1.5 text-green-600 font-semibold">
                    <CheckCircle className="w-4 h-4" />
                    Yes ({punchDataStatus.punchCount} records)
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-red-600 font-semibold">
                    <XCircle className="w-4 h-4" />
                    No data found
                  </span>
                )}
              </div>
              {punchDataStatus?.hasPunchData && (
                <>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-slate-600 font-medium">Clock-in:</span>
                    {punchDataStatus.hasClockIn ? (
                      <span className="flex items-center gap-1.5 text-green-600 font-semibold">
                        <CheckCircle className="w-4 h-4" />
                        Found
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-amber-600 font-semibold">
                        <AlertTriangle className="w-4 h-4" />
                        Missing
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-slate-600 font-medium">Clock-out:</span>
                    {punchDataStatus.hasClockOut ? (
                      <span className="flex items-center gap-1.5 text-green-600 font-semibold">
                        <CheckCircle className="w-4 h-4" />
                        Found
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-amber-600 font-semibold">
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
          <div className="bg-white rounded-xl border-2 border-slate-200 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 bg-slate-100 rounded-lg">
                <Database className="w-4 h-4 text-slate-600" />
              </div>
              <span className="font-bold text-slate-800">Sync Status</span>
            </div>
            <div className="text-sm space-y-3">
              {/* Paylocity */}
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-600 font-medium">Paylocity (punch data):</span>
                <div className="flex items-center gap-2">
                  {syncHealth?.paylocity.isHealthy ? (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  ) : syncHealth?.paylocity.status === 'failed' ? (
                    <XCircle className="w-4 h-4 text-red-600" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                  )}
                  <span className={`font-semibold ${syncHealth?.paylocity.isHealthy ? 'text-green-600' : 'text-amber-600'}`}>
                    {syncHealth?.paylocity.lastSync
                      ? formatDistanceToNow(parseISO(syncHealth.paylocity.lastSync), { addSuffix: true })
                      : 'Never synced'}
                  </span>
                </div>
              </div>
              {syncHealth?.paylocity.lastError && (
                <div className="text-xs font-medium text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">
                  Last error: {syncHealth.paylocity.lastError}
                </div>
              )}

              {/* Arrival/GPS */}
              <div className="flex items-center justify-between py-2">
                <span className="text-slate-600 font-medium">GPS/Arrival data:</span>
                <div className="flex items-center gap-2">
                  {syncHealth?.arrival.isHealthy ? (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                  )}
                  <span className={`font-semibold ${syncHealth?.arrival.isHealthy ? 'text-green-600' : 'text-amber-600'}`}>
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
            <div className="text-xs text-slate-700 bg-slate-100 p-4 rounded-xl border border-slate-200">
              <strong className="text-slate-800">Why is punch data missing?</strong>
              <ul className="list-disc list-inside mt-2 space-y-1 text-slate-600">
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
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl text-sm font-bold shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all duration-200"
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
