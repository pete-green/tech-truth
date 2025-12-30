'use client';

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  MapPin,
  Check,
  X,
  Loader2,
} from 'lucide-react';
import { TimelineEvent } from '@/types/timeline';

interface Violation {
  id: string;
  technicianId: string;
  technicianName: string;
  date: string;
  type: 'clock_in' | 'clock_out' | 'meal_start' | 'meal_end';
  timestamp: string;
  reason: string;
  gpsLocationType?: string;
  address?: string;
  canBeExcused: boolean;
  isExcused: boolean;
  excusedReason?: string;
  punchId?: string;
}

interface ViolationsPanelProps {
  violations: Violation[];
  onExcuseViolation: (violation: Violation, reason: string, notes?: string) => Promise<void>;
  onRemoveExcuse: (violation: Violation) => Promise<void>;
}

const EXCUSE_REASONS = [
  { value: 'pickup_helper', label: 'Pickup Helper' },
  { value: 'meeting', label: 'Company Meeting' },
  { value: 'manager_request', label: 'Manager Request' },
  { value: 'other', label: 'Other' },
];

function ViolationCard({
  violation,
  onExcuse,
  onRemoveExcuse,
}: {
  violation: Violation;
  onExcuse: (reason: string, notes?: string) => Promise<void>;
  onRemoveExcuse: () => Promise<void>;
}) {
  const [showExcuseDropdown, setShowExcuseDropdown] = useState(false);
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [otherNotes, setOtherNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const time = format(parseISO(violation.timestamp), 'h:mm a');
  const dateStr = format(parseISO(violation.date), 'MMM d, yyyy');

  const handleExcuse = async () => {
    if (!selectedReason) return;
    if (selectedReason === 'other' && !otherNotes.trim()) {
      setError('Notes are required when selecting "Other"');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await onExcuse(selectedReason, selectedReason === 'other' ? otherNotes : undefined);
      setShowExcuseDropdown(false);
      setSelectedReason('');
      setOtherNotes('');
    } catch (err: any) {
      setError(err.message || 'Failed to excuse violation');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveExcuse = async () => {
    setLoading(true);
    setError(null);
    try {
      await onRemoveExcuse();
    } catch (err: any) {
      setError(err.message || 'Failed to remove excuse');
    } finally {
      setLoading(false);
    }
  };

  const getTypeLabel = () => {
    switch (violation.type) {
      case 'clock_in':
        return 'Clocked IN';
      case 'clock_out':
        return 'Clocked OUT';
      case 'meal_start':
        return 'Meal Break Started';
      case 'meal_end':
        return 'Meal Break Ended';
      default:
        return 'Clock Event';
    }
  };

  const getLocationLabel = () => {
    switch (violation.gpsLocationType) {
      case 'home':
        return 'at HOME';
      case 'office':
        return 'at OFFICE';
      case 'job':
        return 'at JOB';
      case 'custom':
        return 'at CUSTOM LOCATION';
      default:
        return '';
    }
  };

  // If already excused, show different card style
  if (violation.isExcused) {
    return (
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-l-4 border-green-400 rounded-xl p-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="bg-green-500 text-white p-2 rounded-xl shadow-sm">
              <Check className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-green-800">
                {violation.technicianName} - {getTypeLabel()} {getLocationLabel()}
              </div>
              <div className="text-sm font-medium text-green-700 mt-0.5">
                {dateStr} at {time}
              </div>
              <div className="text-sm font-semibold text-green-600 mt-1.5 inline-flex items-center gap-1 bg-green-100 px-2 py-0.5 rounded-full">
                <Check className="w-3 h-3" />
                {EXCUSE_REASONS.find(r => r.value === violation.excusedReason)?.label || violation.excusedReason}
              </div>
              {violation.address && (
                <div className="text-xs text-green-600 mt-2 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  {violation.address}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={handleRemoveExcuse}
            disabled={loading}
            className="text-sm font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Remove Excuse'}
          </button>
        </div>
        {error && (
          <div className="mt-2 text-sm text-red-600 font-medium">{error}</div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-red-50 to-rose-50 border-l-4 border-red-400 rounded-xl p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="bg-red-500 text-white p-2 rounded-xl shadow-sm">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <div className="font-bold text-red-800">
              {violation.technicianName} - {getTypeLabel()} {getLocationLabel()}
            </div>
            <div className="text-sm font-medium text-red-700 mt-0.5">
              {dateStr} at {time}
            </div>
            <div className="text-sm text-red-600 mt-1.5 font-medium">
              {violation.reason}
            </div>
            {violation.address && (
              <div className="text-xs text-red-600 mt-2 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                {violation.address}
              </div>
            )}
          </div>
        </div>

        {/* Excuse button/dropdown */}
        {violation.canBeExcused && (
          <div className="relative">
            <button
              onClick={() => setShowExcuseDropdown(!showExcuseDropdown)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-white border-2 border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
            >
              Excuse Visit
              {showExcuseDropdown ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>

            {showExcuseDropdown && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-white border-2 border-slate-200 rounded-xl shadow-xl z-10">
                <div className="p-4 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                      Reason for Office Visit
                    </label>
                    <select
                      value={selectedReason}
                      onChange={(e) => setSelectedReason(e.target.value)}
                      className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    >
                      <option value="">Select reason...</option>
                      {EXCUSE_REASONS.map((reason) => (
                        <option key={reason.value} value={reason.value}>
                          {reason.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedReason === 'other' && (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                        Notes (required)
                      </label>
                      <textarea
                        value={otherNotes}
                        onChange={(e) => setOtherNotes(e.target.value)}
                        placeholder="Describe the reason..."
                        rows={2}
                        className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      />
                    </div>
                  )}

                  {error && (
                    <div className="text-xs text-red-600 font-medium">{error}</div>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleExcuse}
                      disabled={!selectedReason || loading}
                      className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-bold bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          Approve
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setShowExcuseDropdown(false);
                        setSelectedReason('');
                        setOtherNotes('');
                        setError(null);
                      }}
                      className="p-2 border-2 border-slate-200 rounded-xl hover:bg-slate-50 transition-all"
                    >
                      <X className="w-4 h-4 text-slate-500" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {!violation.canBeExcused && (
          <span className="text-xs text-slate-500 italic font-medium">
            Cannot be excused
          </span>
        )}
      </div>
    </div>
  );
}

export default function ViolationsPanel({
  violations,
  onExcuseViolation,
  onRemoveExcuse,
}: ViolationsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const activeViolations = violations.filter(v => !v.isExcused);
  const excusedViolations = violations.filter(v => v.isExcused);

  if (violations.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-2xl shadow-md border-2 border-slate-200 mb-6 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full flex items-center justify-between px-5 py-4 text-left transition-all ${
          activeViolations.length > 0
            ? 'bg-gradient-to-r from-red-50 to-rose-50 hover:from-red-100 hover:to-rose-100'
            : 'bg-gradient-to-r from-green-50 to-emerald-50 hover:from-green-100 hover:to-emerald-100'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${activeViolations.length > 0 ? 'bg-red-500' : 'bg-green-500'}`}>
            <AlertTriangle className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-slate-800 uppercase tracking-wide">
            Clock Violations ({activeViolations.length})
          </span>
          {excusedViolations.length > 0 && (
            <span className="text-sm font-semibold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
              {excusedViolations.length} excused
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-slate-500" />
        ) : (
          <ChevronDown className="w-5 h-5 text-slate-500" />
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="border-t-2 border-slate-100 px-5 py-5 space-y-4 bg-slate-50/50">
          {violations.length === 0 ? (
            <div className="text-center text-slate-500 py-6 font-medium">
              No clock violations found for this period.
            </div>
          ) : (
            <>
              {/* Active violations first */}
              {activeViolations.map((violation) => (
                <ViolationCard
                  key={violation.id}
                  violation={violation}
                  onExcuse={(reason, notes) => onExcuseViolation(violation, reason, notes)}
                  onRemoveExcuse={() => onRemoveExcuse(violation)}
                />
              ))}

              {/* Excused violations */}
              {excusedViolations.length > 0 && activeViolations.length > 0 && (
                <div className="border-t-2 border-slate-200 pt-4 mt-4">
                  <div className="text-sm font-bold text-slate-600 uppercase tracking-wide mb-3">
                    Excused Visits
                  </div>
                </div>
              )}
              {excusedViolations.map((violation) => (
                <ViolationCard
                  key={violation.id}
                  violation={violation}
                  onExcuse={(reason, notes) => onExcuseViolation(violation, reason, notes)}
                  onRemoveExcuse={() => onRemoveExcuse(violation)}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export type { Violation };
