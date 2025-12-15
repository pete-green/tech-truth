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
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="bg-green-500 text-white p-1.5 rounded-full">
              <Check className="w-4 h-4" />
            </div>
            <div>
              <div className="font-medium text-green-800">
                {violation.technicianName} - {getTypeLabel()} {getLocationLabel()}
              </div>
              <div className="text-sm text-green-700 mt-0.5">
                {dateStr} at {time}
              </div>
              <div className="text-sm text-green-600 mt-1">
                Excused: {EXCUSE_REASONS.find(r => r.value === violation.excusedReason)?.label || violation.excusedReason}
              </div>
              {violation.address && (
                <div className="text-xs text-green-600 mt-1 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {violation.address}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={handleRemoveExcuse}
            disabled={loading}
            className="text-sm text-red-600 hover:text-red-700 hover:underline disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Remove Excuse'}
          </button>
        </div>
        {error && (
          <div className="mt-2 text-sm text-red-600">{error}</div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="bg-red-500 text-white p-1.5 rounded-full">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <div className="font-medium text-red-800">
              {violation.technicianName} - {getTypeLabel()} {getLocationLabel()}
            </div>
            <div className="text-sm text-red-700 mt-0.5">
              {dateStr} at {time}
            </div>
            <div className="text-sm text-red-600 mt-1">
              {violation.reason}
            </div>
            {violation.address && (
              <div className="text-xs text-red-600 mt-1 flex items-center gap-1">
                <MapPin className="w-3 h-3" />
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
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Excuse Visit
              {showExcuseDropdown ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>

            {showExcuseDropdown && (
              <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                <div className="p-3 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Reason for Office Visit
                    </label>
                    <select
                      value={selectedReason}
                      onChange={(e) => setSelectedReason(e.target.value)}
                      className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Notes (required)
                      </label>
                      <textarea
                        value={otherNotes}
                        onChange={(e) => setOtherNotes(e.target.value)}
                        placeholder="Describe the reason..."
                        rows={2}
                        className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}

                  {error && (
                    <div className="text-xs text-red-600">{error}</div>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleExcuse}
                      disabled={!selectedReason || loading}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {!violation.canBeExcused && (
          <span className="text-xs text-gray-500 italic">
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
    <div className="bg-white rounded-lg shadow-sm border mb-6">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className={`w-5 h-5 ${activeViolations.length > 0 ? 'text-red-500' : 'text-green-500'}`} />
          <span className="font-semibold text-gray-900">
            CLOCK VIOLATIONS ({activeViolations.length})
          </span>
          {excusedViolations.length > 0 && (
            <span className="text-sm text-green-600">
              ({excusedViolations.length} excused)
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="border-t px-4 py-4 space-y-3">
          {violations.length === 0 ? (
            <div className="text-center text-gray-500 py-4">
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
                <div className="border-t pt-3 mt-3">
                  <div className="text-sm font-medium text-gray-500 mb-2">
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
