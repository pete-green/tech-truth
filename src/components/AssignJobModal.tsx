'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, MapPin, Briefcase, Search, Loader2, Clock, Navigation, Check } from 'lucide-react';
import { MapContainer, TileLayer, Marker, MapRecenter } from './LeafletMapWrapper';
import { format, parseISO } from 'date-fns';

interface Job {
  id: string;
  jobNumber: string;
  customerName: string | null;
  jobAddress: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  jobLatitude: number | null;
  jobLongitude: number | null;
  actualArrival: string | null;
  status: string | null;
  distanceFeet: number | null;
  hasManualAssociation: boolean;
}

interface AssignJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  technicianId: string;
  technicianName: string;
  date: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  address: string;
  onAssign: (jobId: string) => Promise<void>;
}

function formatDistance(feet: number | null): string {
  if (feet === null) return 'Unknown';
  if (feet < 1000) return `${feet} ft`;
  const miles = feet / 5280;
  return `${miles.toFixed(1)} mi`;
}

export default function AssignJobModal({
  isOpen,
  onClose,
  technicianId,
  technicianName,
  date,
  latitude,
  longitude,
  timestamp,
  address,
  onAssign,
}: AssignJobModalProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const [icon, setIcon] = useState<any>(null);

  // Load Leaflet icon on client side only
  useEffect(() => {
    import('leaflet').then((L) => {
      const MarkerIcon = new L.Icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-yellow.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      });
      setIcon(MarkerIcon);
    });
  }, []);

  // Fetch jobs when modal opens
  useEffect(() => {
    if (isOpen) {
      setMapReady(false);
      const timer = setTimeout(() => setMapReady(true), 100);
      fetchJobs();
      return () => clearTimeout(timer);
    } else {
      setJobs([]);
      setSearchQuery('');
      setError('');
    }
  }, [isOpen, technicianId, date, latitude, longitude]);

  const fetchJobs = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        technicianId,
        date,
        latitude: latitude.toString(),
        longitude: longitude.toString(),
      });
      const response = await fetch(`/api/jobs/for-technician?${params}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch jobs');
      }
      const data = await response.json();
      setJobs(data.jobs || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async (jobId: string) => {
    setAssigning(jobId);
    setError('');
    try {
      await onAssign(jobId);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to assign job');
    } finally {
      setAssigning(null);
    }
  };

  // Filter jobs by search query
  const filteredJobs = useMemo(() => {
    if (!searchQuery.trim()) return jobs;
    const query = searchQuery.toLowerCase();
    return jobs.filter(job =>
      job.jobNumber?.toLowerCase().includes(query) ||
      job.customerName?.toLowerCase().includes(query) ||
      job.jobAddress?.toLowerCase().includes(query)
    );
  }, [jobs, searchQuery]);

  const stopTime = timestamp ? format(parseISO(timestamp), 'h:mm a') : '';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
          <div className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Assign Job to Stop</h3>
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
          {/* Stop Info */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <div className="flex items-start gap-2 text-sm">
              <MapPin className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium text-yellow-900">Unknown Stop at {stopTime}</div>
                <div className="text-yellow-700">{address}</div>
              </div>
            </div>
          </div>

          {/* Map */}
          <div className="rounded-lg overflow-hidden border border-gray-200 h-40">
            {mapReady && icon ? (
              <MapContainer
                center={[latitude, longitude]}
                zoom={15}
                className="h-full w-full"
              >
                <MapRecenter lat={latitude} lon={longitude} />
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker position={[latitude, longitude]} icon={icon} />
              </MapContainer>
            ) : (
              <div className="h-full flex items-center justify-center bg-gray-100">
                <span className="text-gray-500">Loading map...</span>
              </div>
            )}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search jobs by number, customer, or address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          {/* Jobs List */}
          <div className="space-y-2">
            <div className="text-sm font-medium text-gray-700">
              {technicianName}'s Jobs on {format(parseISO(date), 'MMM d, yyyy')}
              {filteredJobs.length > 0 && (
                <span className="text-gray-500 font-normal ml-1">
                  ({filteredJobs.length} {filteredJobs.length === 1 ? 'job' : 'jobs'})
                </span>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {searchQuery ? 'No jobs match your search' : 'No scheduled jobs for this date'}
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {filteredJobs.map((job) => (
                  <div
                    key={job.id}
                    className={`border rounded-lg p-3 transition-colors ${
                      job.hasManualAssociation
                        ? 'bg-gray-50 border-gray-200'
                        : 'bg-white border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">
                            #{job.jobNumber}
                          </span>
                          {job.distanceFeet !== null && (
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              job.distanceFeet <= 300
                                ? 'bg-green-100 text-green-700'
                                : job.distanceFeet <= 1000
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              <Navigation className="w-3 h-3 inline mr-0.5" />
                              {formatDistance(job.distanceFeet)}
                            </span>
                          )}
                          {job.actualArrival && (
                            <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                              Has arrival
                            </span>
                          )}
                          {job.hasManualAssociation && (
                            <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">
                              Already assigned
                            </span>
                          )}
                        </div>
                        {job.customerName && (
                          <div className="text-sm text-gray-700 mt-0.5 truncate">
                            {job.customerName}
                          </div>
                        )}
                        {job.jobAddress && (
                          <div className="text-xs text-gray-500 mt-0.5 truncate">
                            {job.jobAddress}
                          </div>
                        )}
                        {job.scheduledStart && (
                          <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                            <Clock className="w-3 h-3" />
                            Scheduled: {format(parseISO(job.scheduledStart), 'h:mm a')}
                            {job.scheduledEnd && ` - ${format(parseISO(job.scheduledEnd), 'h:mm a')}`}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleAssign(job.id)}
                        disabled={assigning === job.id || job.hasManualAssociation}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                          job.hasManualAssociation
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : assigning === job.id
                            ? 'bg-blue-100 text-blue-600'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                      >
                        {assigning === job.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : job.hasManualAssociation ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          'Assign'
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
