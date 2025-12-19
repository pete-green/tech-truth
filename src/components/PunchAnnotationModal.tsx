'use client';

import { useState, useEffect } from 'react';
import { X, MessageSquare, Clock, Save, Loader2, Trash2, AlertTriangle, Flag, Edit3 } from 'lucide-react';
import { format, parseISO } from 'date-fns';

type AnnotationType = 'observation' | 'time_correction' | 'flagged';

interface PunchAnnotation {
  id: string;
  punch_record_id: string;
  note: string;
  proposed_time: string | null;
  annotation_type: AnnotationType;
  created_at: string;
  created_by: string;
}

interface PunchAnnotationModalProps {
  isOpen: boolean;
  onClose: () => void;
  punchRecordId: string;
  punchType: string; // 'ClockIn', 'ClockOut', 'MealStart', 'MealEnd'
  punchTime: string; // ISO timestamp
  gpsLocationType?: string;
  address?: string;
  isViolation?: boolean;
  violationReason?: string;
  onAnnotationAdded?: () => void;
}

const ANNOTATION_TYPE_INFO: Record<AnnotationType, { label: string; icon: React.ReactNode; color: string }> = {
  observation: {
    label: 'Observation',
    icon: <MessageSquare className="w-4 h-4" />,
    color: 'blue',
  },
  time_correction: {
    label: 'Time Correction',
    icon: <Edit3 className="w-4 h-4" />,
    color: 'orange',
  },
  flagged: {
    label: 'Flagged for Review',
    icon: <Flag className="w-4 h-4" />,
    color: 'red',
  },
};

function formatPunchType(type: string): string {
  switch (type) {
    case 'ClockIn':
      return 'Clock In';
    case 'ClockOut':
      return 'Clock Out';
    case 'MealStart':
      return 'Meal Break Start';
    case 'MealEnd':
      return 'Meal Break End';
    default:
      return type;
  }
}

export default function PunchAnnotationModal({
  isOpen,
  onClose,
  punchRecordId,
  punchType,
  punchTime,
  gpsLocationType,
  address,
  isViolation,
  violationReason,
  onAnnotationAdded,
}: PunchAnnotationModalProps) {
  const [annotations, setAnnotations] = useState<PunchAnnotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Form state
  const [note, setNote] = useState('');
  const [annotationType, setAnnotationType] = useState<AnnotationType>('observation');
  const [proposedTime, setProposedTime] = useState('');
  const [showTimeCorrection, setShowTimeCorrection] = useState(false);

  // Fetch existing annotations
  useEffect(() => {
    if (isOpen && punchRecordId) {
      fetchAnnotations();
    }
  }, [isOpen, punchRecordId]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setNote('');
      setAnnotationType('observation');
      setProposedTime('');
      setShowTimeCorrection(false);
      setError('');
    }
  }, [isOpen]);

  const fetchAnnotations = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/punch-annotations?punchRecordId=${punchRecordId}`);
      const data = await response.json();
      if (data.success) {
        setAnnotations(data.annotations);
      } else {
        setError(data.error || 'Failed to load annotations');
      }
    } catch (err) {
      setError('Failed to load annotations');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!note.trim()) {
      setError('Please enter a note');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const response = await fetch('/api/punch-annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          punchRecordId,
          note: note.trim(),
          annotationType,
          proposedTime: showTimeCorrection && proposedTime ? new Date(proposedTime).toISOString() : null,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setNote('');
        setProposedTime('');
        setShowTimeCorrection(false);
        setAnnotationType('observation');
        await fetchAnnotations();
        onAnnotationAdded?.();
      } else {
        setError(data.error || 'Failed to save annotation');
      }
    } catch (err) {
      setError('Failed to save annotation');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (annotationId: string) => {
    setDeleting(annotationId);
    try {
      const response = await fetch(`/api/punch-annotations?id=${annotationId}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (data.success) {
        await fetchAnnotations();
        onAnnotationAdded?.();
      } else {
        setError(data.error || 'Failed to delete annotation');
      }
    } catch (err) {
      setError('Failed to delete annotation');
    } finally {
      setDeleting(null);
    }
  };

  if (!isOpen) return null;

  const punchDateTime = parseISO(punchTime);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Annotate Punch Record</h3>
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
          {/* Punch Details */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-900">{formatPunchType(punchType)}</span>
              <span className="text-sm font-mono text-gray-600">
                {format(punchDateTime, 'h:mm a')}
              </span>
            </div>
            <div className="text-sm text-gray-600">
              {format(punchDateTime, 'MMMM d, yyyy')}
            </div>
            {gpsLocationType && gpsLocationType !== 'no_gps' && (
              <div className="text-xs text-gray-500">
                GPS Location: {gpsLocationType}
              </div>
            )}
            {address && (
              <div className="text-xs text-gray-500 truncate">
                {address}
              </div>
            )}
            {isViolation && violationReason && (
              <div className="flex items-center gap-1 text-xs text-red-600 mt-1">
                <AlertTriangle className="w-3 h-3" />
                {violationReason}
              </div>
            )}
          </div>

          {/* Existing Annotations */}
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : annotations.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-700">Existing Annotations</h4>
              {annotations.map((annotation) => {
                const typeInfo = ANNOTATION_TYPE_INFO[annotation.annotation_type];
                return (
                  <div
                    key={annotation.id}
                    className={`border rounded-lg p-3 bg-${typeInfo.color}-50 border-${typeInfo.color}-200`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        {typeInfo.icon}
                        <span className={`text-${typeInfo.color}-700`}>{typeInfo.label}</span>
                      </div>
                      <button
                        onClick={() => handleDelete(annotation.id)}
                        disabled={deleting === annotation.id}
                        className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                      >
                        {deleting === annotation.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <p className="text-sm text-gray-700 mt-1">{annotation.note}</p>
                    {annotation.proposed_time && (
                      <div className="text-xs text-orange-600 mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Proposed: {format(parseISO(annotation.proposed_time), 'h:mm a')}
                      </div>
                    )}
                    <div className="text-xs text-gray-400 mt-1">
                      {format(parseISO(annotation.created_at), 'MMM d, yyyy h:mm a')}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* Add New Annotation */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-gray-700">Add Annotation</h4>

            {/* Annotation Type */}
            <div className="flex gap-2">
              {(Object.keys(ANNOTATION_TYPE_INFO) as AnnotationType[]).map((type) => {
                const info = ANNOTATION_TYPE_INFO[type];
                const isSelected = annotationType === type;
                return (
                  <button
                    key={type}
                    onClick={() => {
                      setAnnotationType(type);
                      if (type === 'time_correction') {
                        setShowTimeCorrection(true);
                      }
                    }}
                    className={`flex-1 flex items-center justify-center gap-1 px-2 py-2 rounded-lg border text-sm transition-all ${
                      isSelected
                        ? `bg-${info.color}-50 border-${info.color}-300 text-${info.color}-700 ring-2 ring-${info.color}-500 ring-offset-1`
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {info.icon}
                    <span className="hidden sm:inline">{info.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Note */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Note
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Enter your observation or correction note..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm resize-none"
              />
            </div>

            {/* Time Correction */}
            <div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showTimeCorrection}
                  onChange={(e) => setShowTimeCorrection(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-gray-700">Propose time correction</span>
              </label>
              {showTimeCorrection && (
                <div className="mt-2">
                  <input
                    type="datetime-local"
                    value={proposedTime}
                    onChange={(e) => setProposedTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    The time you believe this punch should have been recorded
                  </p>
                </div>
              )}
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
            disabled={saving || !note.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Annotation
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
