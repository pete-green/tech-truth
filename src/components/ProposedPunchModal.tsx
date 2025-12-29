'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Clock, Save, Loader2, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';

type PunchType = 'ClockIn' | 'ClockOut' | 'MealStart' | 'MealEnd';
type ProposedStatus = 'pending' | 'submitted' | 'applied' | 'rejected';

interface ProposedPunch {
  id: string;
  technician_id: string;
  date: string;
  punch_type: PunchType;
  proposed_time: string;
  note: string;
  status: ProposedStatus;
  created_at: string;
  created_by: string;
}

interface ProposedPunchModalProps {
  isOpen: boolean;
  onClose: () => void;
  technicianId: string;
  technicianName: string;
  date: string; // YYYY-MM-DD
  onPunchAdded?: () => void;
}

const PUNCH_TYPES: { value: PunchType; label: string }[] = [
  { value: 'ClockIn', label: 'Clock In' },
  { value: 'ClockOut', label: 'Clock Out' },
  { value: 'MealStart', label: 'Meal Break Start' },
  { value: 'MealEnd', label: 'Meal Break End' },
];

const STATUS_COLORS: Record<ProposedStatus, { bg: string; text: string }> = {
  pending: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  submitted: { bg: 'bg-blue-100', text: 'text-blue-700' },
  applied: { bg: 'bg-green-100', text: 'text-green-700' },
  rejected: { bg: 'bg-red-100', text: 'text-red-700' },
};

export default function ProposedPunchModal({
  isOpen,
  onClose,
  technicianId,
  technicianName,
  date,
  onPunchAdded,
}: ProposedPunchModalProps) {
  const [proposedPunches, setProposedPunches] = useState<ProposedPunch[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Form state
  const [punchType, setPunchType] = useState<PunchType>('ClockIn');
  const [proposedTime, setProposedTime] = useState('');
  const [note, setNote] = useState('');

  // Fetch existing proposed punches
  useEffect(() => {
    if (isOpen && technicianId && date) {
      fetchProposedPunches();
    }
  }, [isOpen, technicianId, date]);

  // Set default time when modal opens (date with 8:00 AM default)
  useEffect(() => {
    if (isOpen && date && !proposedTime) {
      // Set default to 8:00 AM on the selected date
      setProposedTime(`${date}T08:00`);
    }
  }, [isOpen, date]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setPunchType('ClockIn');
      setProposedTime('');
      setNote('');
      setError('');
    }
  }, [isOpen]);

  const fetchProposedPunches = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/proposed-punches?technicianId=${technicianId}&date=${date}`
      );
      const data = await response.json();
      if (data.success) {
        setProposedPunches(data.proposedPunches);
      } else {
        setError(data.error || 'Failed to load proposed punches');
      }
    } catch (err) {
      setError('Failed to load proposed punches');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!proposedTime) {
      setError('Please select a time');
      return;
    }
    if (!note.trim()) {
      setError('Please enter a note explaining the reason');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const response = await fetch('/api/proposed-punches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          technicianId,
          date,
          punchType,
          proposedTime: new Date(proposedTime).toISOString(),
          note: note.trim(),
        }),
      });

      const data = await response.json();

      if (data.success) {
        setPunchType('ClockIn');
        setProposedTime('');
        setNote('');
        await fetchProposedPunches();
        onPunchAdded?.();
      } else {
        setError(data.error || 'Failed to create proposed punch');
      }
    } catch (err) {
      setError('Failed to create proposed punch');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (punchId: string) => {
    setDeleting(punchId);
    try {
      const response = await fetch(`/api/proposed-punches?id=${punchId}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (data.success) {
        await fetchProposedPunches();
        onPunchAdded?.();
      } else {
        setError(data.error || 'Failed to delete proposed punch');
      }
    } catch (err) {
      setError('Failed to delete proposed punch');
    } finally {
      setDeleting(null);
    }
  };

  if (!isOpen) return null;

  const formattedDate = format(parseISO(date), 'MMMM d, yyyy');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-orange-600" />
            <h3 className="font-semibold text-gray-900">Add Missing Punch</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-200 rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Technician and Date Info */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-1">
            <div className="font-medium text-gray-900">{technicianName}</div>
            <div className="text-sm text-gray-600">{formattedDate}</div>
          </div>

          {/* Existing Proposed Punches */}
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : proposedPunches.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-700">Proposed Punches for This Day</h4>
              {proposedPunches.map((punch) => {
                const statusColors = STATUS_COLORS[punch.status];
                const typeLabel = PUNCH_TYPES.find((t) => t.value === punch.punch_type)?.label || punch.punch_type;
                return (
                  <div
                    key={punch.id}
                    className="border border-orange-200 rounded-lg p-3 bg-orange-50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-orange-900">{typeLabel}</span>
                          <span className="text-sm font-mono text-orange-700">
                            {format(parseISO(punch.proposed_time), 'h:mm a')}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{punch.note}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors.bg} ${statusColors.text}`}>
                            {punch.status.charAt(0).toUpperCase() + punch.status.slice(1)}
                          </span>
                          <span className="text-xs text-gray-400">
                            {format(parseISO(punch.created_at), 'MMM d, h:mm a')}
                          </span>
                        </div>
                      </div>
                      {punch.status === 'pending' && (
                        <button
                          onClick={() => handleDelete(punch.id)}
                          disabled={deleting === punch.id}
                          className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                        >
                          {deleting === punch.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* Add New Proposed Punch */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-gray-700">Create New Proposed Punch</h4>

            {/* Punch Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Punch Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                {PUNCH_TYPES.map((type) => (
                  <button
                    key={type.value}
                    onClick={() => setPunchType(type.value)}
                    className={`px-3 py-2 rounded-lg border text-sm transition-all ${
                      punchType === type.value
                        ? 'bg-orange-50 border-orange-300 text-orange-700 ring-2 ring-orange-500 ring-offset-1'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Proposed Time */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Proposed Time
              </label>
              {/* Quick time presets */}
              <div className="flex flex-wrap gap-2 mb-2">
                {[
                  { label: '7:00 AM', time: '07:00' },
                  { label: '8:00 AM', time: '08:00' },
                  { label: '9:00 AM', time: '09:00' },
                  { label: '12:00 PM', time: '12:00' },
                  { label: '1:00 PM', time: '13:00' },
                  { label: '4:00 PM', time: '16:00' },
                  { label: '5:00 PM', time: '17:00' },
                  { label: '6:00 PM', time: '18:00' },
                ].map((preset) => (
                  <button
                    key={preset.time}
                    type="button"
                    onClick={() => setProposedTime(`${date}T${preset.time}`)}
                    className={`px-2 py-1 text-xs rounded border transition-colors ${
                      proposedTime === `${date}T${preset.time}`
                        ? 'bg-orange-100 border-orange-400 text-orange-700'
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <input
                type="datetime-local"
                value={proposedTime}
                onChange={(e) => setProposedTime(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Select a preset time above or pick a custom time
              </p>
            </div>

            {/* Note/Reason */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason / Evidence
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Explain why this punch should be added (e.g., GPS shows arrival at 7:15 AM but no clock-in recorded)"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm resize-none"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="text-red-600 text-sm bg-red-50 p-2 rounded">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t bg-gray-50">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Close
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !proposedTime || !note.trim()}
            className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Add Proposed Punch
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
