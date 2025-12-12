'use client';

import { useState } from 'react';
import { Search, CheckSquare, Square, Users } from 'lucide-react';
import { TechnicianFilterItem } from '@/types/reports';

interface TechnicianFilterProps {
  technicians: TechnicianFilterItem[];
  selectedIds: Set<string>;
  onSelectionChange: (selectedIds: Set<string>) => void;
  loading?: boolean;
}

export default function TechnicianFilter({
  technicians,
  selectedIds,
  onSelectionChange,
  loading = false,
}: TechnicianFilterProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredTechnicians = technicians.filter((tech) =>
    tech.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelectAll = () => {
    onSelectionChange(new Set(technicians.map((t) => t.id)));
  };

  const handleClearAll = () => {
    onSelectionChange(new Set());
  };

  const handleToggle = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    onSelectionChange(newSet);
  };

  const allSelected = selectedIds.size === technicians.length;
  const noneSelected = selectedIds.size === 0;

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-700">Technicians</h3>
          </div>
          <div className="flex gap-1">
            <button
              onClick={handleSelectAll}
              disabled={allSelected || loading}
              className="text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50 disabled:hover:bg-transparent"
            >
              All
            </button>
            <button
              onClick={handleClearAll}
              disabled={noneSelected || loading}
              className="text-xs px-2 py-1 text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50 disabled:hover:bg-transparent"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search technicians..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Technician List */}
      <div className="max-h-64 overflow-y-auto">
        {filteredTechnicians.length === 0 ? (
          <div className="px-4 py-3 text-sm text-gray-500 text-center">
            No technicians found
          </div>
        ) : (
          filteredTechnicians.map((tech) => {
            const isSelected = selectedIds.has(tech.id);
            return (
              <button
                key={tech.id}
                onClick={() => handleToggle(tech.id)}
                disabled={loading}
                className={`w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-gray-50 transition-colors ${
                  loading ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {isSelected ? (
                  <CheckSquare className="w-4 h-4 text-blue-600 flex-shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-gray-400 flex-shrink-0" />
                )}
                <span className="flex-1 text-sm text-gray-900 truncate">
                  {tech.name}
                </span>
                <span className="text-xs text-gray-500 flex-shrink-0">
                  {tech.totalFirstJobs} jobs
                </span>
                {tech.lateFirstJobs > 0 && (
                  <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded flex-shrink-0">
                    {tech.lateFirstJobs} late
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t bg-gray-50 text-xs text-gray-500">
        {selectedIds.size} of {technicians.length} selected
      </div>
    </div>
  );
}
