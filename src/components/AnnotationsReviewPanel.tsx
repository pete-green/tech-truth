'use client';

import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import {
  MessageSquare,
  Edit3,
  Flag,
  Plus,
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Filter,
} from 'lucide-react';
import Link from 'next/link';

type AnnotationType = 'observation' | 'time_correction' | 'flagged';
type ProposedStatus = 'pending' | 'submitted' | 'applied' | 'rejected';

interface Annotation {
  id: string;
  type: AnnotationType;
  note: string;
  proposed_time: string | null;
  created_at: string;
  created_by: string;
  punchRecordId: string;
  technicianId: string;
  technicianName: string;
  punchType: string;
  punchTime: string;
  punchDate: string;
}

interface ProposedPunch {
  id: string;
  technicianId: string;
  technicianName: string;
  date: string;
  punchType: string;
  proposedTime: string;
  note: string;
  status: ProposedStatus;
  created_at: string;
  created_by: string;
}

interface Stats {
  totalObservations: number;
  totalTimeCorrections: number;
  totalFlagged: number;
  totalProposedPunches: number;
  pendingProposedPunches: number;
}

const ANNOTATION_TYPE_INFO: Record<AnnotationType, { label: string; icon: React.ReactNode; bgColor: string; textColor: string; borderColor: string }> = {
  observation: {
    label: 'Observation',
    icon: <MessageSquare className="w-4 h-4" />,
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-200',
  },
  time_correction: {
    label: 'Time Correction',
    icon: <Edit3 className="w-4 h-4" />,
    bgColor: 'bg-orange-100',
    textColor: 'text-orange-700',
    borderColor: 'border-orange-200',
  },
  flagged: {
    label: 'Flagged',
    icon: <Flag className="w-4 h-4" />,
    bgColor: 'bg-red-100',
    textColor: 'text-red-700',
    borderColor: 'border-red-200',
  },
};

const STATUS_INFO: Record<ProposedStatus, { label: string; bgColor: string; textColor: string }> = {
  pending: { label: 'Pending', bgColor: 'bg-yellow-100', textColor: 'text-yellow-700' },
  submitted: { label: 'Submitted', bgColor: 'bg-blue-100', textColor: 'text-blue-700' },
  applied: { label: 'Applied', bgColor: 'bg-green-100', textColor: 'text-green-700' },
  rejected: { label: 'Rejected', bgColor: 'bg-red-100', textColor: 'text-red-700' },
};

function formatPunchType(type: string): string {
  switch (type) {
    case 'ClockIn': return 'Clock In';
    case 'ClockOut': return 'Clock Out';
    case 'MealStart': return 'Meal Start';
    case 'MealEnd': return 'Meal End';
    default: return type;
  }
}

export default function AnnotationsReviewPanel() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({
    totalObservations: 0,
    totalTimeCorrections: 0,
    totalFlagged: 0,
    totalProposedPunches: 0,
    pendingProposedPunches: 0,
  });
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [proposedPunches, setProposedPunches] = useState<ProposedPunch[]>([]);
  const [activeTab, setActiveTab] = useState<'annotations' | 'proposed'>('annotations');
  const [typeFilter, setTypeFilter] = useState<AnnotationType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<ProposedStatus | 'all'>('all');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/annotations/summary');
      const data = await response.json();
      if (data.success) {
        setStats(data.stats);
        setAnnotations(data.annotations);
        setProposedPunches(data.proposedPunches);
      }
    } catch (err) {
      console.error('Error fetching annotations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const filteredAnnotations = typeFilter === 'all'
    ? annotations
    : annotations.filter(a => a.type === typeFilter);

  const filteredProposed = statusFilter === 'all'
    ? proposedPunches
    : proposedPunches.filter(p => p.status === statusFilter);

  const totalAnnotations = stats.totalObservations + stats.totalTimeCorrections + stats.totalFlagged;

  return (
    <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">Punch Annotations & Corrections</h2>
        <button
          onClick={fetchData}
          disabled={loading}
          className="p-2 hover:bg-gray-200 rounded transition-colors"
        >
          <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 border-b bg-gray-50">
        <div className="bg-white rounded-lg border p-3">
          <div className="flex items-center gap-2 mb-1">
            <MessageSquare className="w-4 h-4 text-blue-600" />
            <span className="text-xs text-gray-500">Observations</span>
          </div>
          <p className="text-xl font-bold text-blue-700">{stats.totalObservations}</p>
        </div>
        <div className="bg-white rounded-lg border p-3">
          <div className="flex items-center gap-2 mb-1">
            <Edit3 className="w-4 h-4 text-orange-600" />
            <span className="text-xs text-gray-500">Time Corrections</span>
          </div>
          <p className="text-xl font-bold text-orange-700">{stats.totalTimeCorrections}</p>
        </div>
        <div className="bg-white rounded-lg border p-3">
          <div className="flex items-center gap-2 mb-1">
            <Flag className="w-4 h-4 text-red-600" />
            <span className="text-xs text-gray-500">Flagged</span>
          </div>
          <p className="text-xl font-bold text-red-700">{stats.totalFlagged}</p>
        </div>
        <div className="bg-white rounded-lg border p-3">
          <div className="flex items-center gap-2 mb-1">
            <Plus className="w-4 h-4 text-purple-600" />
            <span className="text-xs text-gray-500">Proposed Punches</span>
          </div>
          <p className="text-xl font-bold text-purple-700">{stats.totalProposedPunches}</p>
        </div>
        <div className="bg-white rounded-lg border p-3">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-yellow-600" />
            <span className="text-xs text-gray-500">Pending Review</span>
          </div>
          <p className="text-xl font-bold text-yellow-700">{stats.pendingProposedPunches}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <div className="flex">
          <button
            onClick={() => setActiveTab('annotations')}
            className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'annotations'
                ? 'border-blue-600 text-blue-600 bg-blue-50'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Annotations ({totalAnnotations})
          </button>
          <button
            onClick={() => setActiveTab('proposed')}
            className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'proposed'
                ? 'border-orange-600 text-orange-600 bg-orange-50'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Proposed Punches ({stats.totalProposedPunches})
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="px-4 py-2 border-b bg-gray-50 flex items-center gap-2">
        <Filter className="w-4 h-4 text-gray-400" />
        {activeTab === 'annotations' ? (
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as AnnotationType | 'all')}
            className="text-sm border rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Types</option>
            <option value="observation">Observations</option>
            <option value="time_correction">Time Corrections</option>
            <option value="flagged">Flagged</option>
          </select>
        ) : (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ProposedStatus | 'all')}
            className="text-sm border rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="submitted">Submitted</option>
            <option value="applied">Applied</option>
            <option value="rejected">Rejected</option>
          </select>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="p-8 text-center">
          <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-2" />
          <p className="text-gray-500">Loading...</p>
        </div>
      ) : activeTab === 'annotations' ? (
        filteredAnnotations.length === 0 ? (
          <div className="p-8 text-center">
            <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500">No annotations found</p>
            <p className="text-sm text-gray-400 mt-1">
              Add annotations from the Stop Details page
            </p>
          </div>
        ) : (
          <div className="divide-y max-h-96 overflow-y-auto">
            {filteredAnnotations.map((annotation) => {
              const typeInfo = ANNOTATION_TYPE_INFO[annotation.type];
              const isExpanded = expandedRows.has(annotation.id);
              return (
                <div key={annotation.id}>
                  <div
                    className="px-4 py-3 hover:bg-gray-50 cursor-pointer"
                    onClick={() => toggleRow(annotation.id)}
                  >
                    <div className="flex items-start gap-3">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${typeInfo.bgColor} ${typeInfo.textColor}`}>
                            {typeInfo.icon}
                            {typeInfo.label}
                          </span>
                          <span className="font-medium text-gray-900">{annotation.technicianName}</span>
                          <span className="text-sm text-gray-500">
                            {formatPunchType(annotation.punchType)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1 truncate">{annotation.note}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                          <span>{format(parseISO(annotation.punchDate), 'MMM d, yyyy')}</span>
                          <span>{format(parseISO(annotation.punchTime), 'h:mm a')}</span>
                          <span>Added {format(parseISO(annotation.created_at), 'MMM d')}</span>
                        </div>
                      </div>
                      {annotation.proposed_time && (
                        <div className="text-right flex-shrink-0">
                          <div className="text-xs text-gray-500">Proposed</div>
                          <div className="text-sm font-medium text-orange-600">
                            {format(parseISO(annotation.proposed_time), 'h:mm a')}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-4 py-3 bg-gray-50 border-t">
                      <div className="ml-7 space-y-2">
                        <div>
                          <p className="text-xs text-gray-500 uppercase">Full Note</p>
                          <p className="text-sm text-gray-900">{annotation.note}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <Link
                            href={`/stops?technicianId=${annotation.technicianId}&date=${annotation.punchDate}`}
                            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                          >
                            <ExternalLink className="w-3 h-3" />
                            View in Timeline
                          </Link>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        filteredProposed.length === 0 ? (
          <div className="p-8 text-center">
            <Plus className="w-12 h-12 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500">No proposed punches found</p>
            <p className="text-sm text-gray-400 mt-1">
              Add missing punches from the Stop Details page
            </p>
          </div>
        ) : (
          <div className="divide-y max-h-96 overflow-y-auto">
            {filteredProposed.map((proposed) => {
              const statusInfo = STATUS_INFO[proposed.status];
              const isExpanded = expandedRows.has(proposed.id);
              return (
                <div key={proposed.id}>
                  <div
                    className="px-4 py-3 hover:bg-gray-50 cursor-pointer"
                    onClick={() => toggleRow(proposed.id)}
                  >
                    <div className="flex items-start gap-3">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusInfo.bgColor} ${statusInfo.textColor}`}>
                            {statusInfo.label}
                          </span>
                          <span className="font-medium text-gray-900">{proposed.technicianName}</span>
                          <span className="text-sm text-gray-500">
                            {formatPunchType(proposed.punchType)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1 truncate">{proposed.note}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                          <span>{format(parseISO(proposed.date), 'MMM d, yyyy')}</span>
                          <span>Proposed: {format(parseISO(proposed.proposedTime), 'h:mm a')}</span>
                          <span>Added {format(parseISO(proposed.created_at), 'MMM d')}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-4 py-3 bg-gray-50 border-t">
                      <div className="ml-7 space-y-2">
                        <div>
                          <p className="text-xs text-gray-500 uppercase">Full Note / Evidence</p>
                          <p className="text-sm text-gray-900">{proposed.note}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <Link
                            href={`/stops?technicianId=${proposed.technicianId}&date=${proposed.date}`}
                            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                          >
                            <ExternalLink className="w-3 h-3" />
                            View in Timeline
                          </Link>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
