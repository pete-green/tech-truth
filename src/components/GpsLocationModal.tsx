'use client';

import { useEffect, useState } from 'react';
import { X, MapPin, Truck, RefreshCw } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { MapContainer, TileLayer, Marker, Popup } from './LeafletMapWrapper';
import { FirstCallLocationData } from '@/types/reports';

interface GpsLocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  technicianName: string;
  jobDate: string;
  scheduledTime: string;
  technicianId: string;
  jobId: string;
}

export default function GpsLocationModal({
  isOpen,
  onClose,
  technicianName,
  jobDate,
  scheduledTime,
  technicianId,
  jobId,
}: GpsLocationModalProps) {
  const [data, setData] = useState<FirstCallLocationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchLocation();
      // Small delay to ensure Leaflet loads properly
      const timer = setTimeout(() => setMapReady(true), 100);
      return () => clearTimeout(timer);
    } else {
      setMapReady(false);
    }
  }, [isOpen, technicianId, jobId, scheduledTime]);

  const fetchLocation = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        technicianId,
        jobId,
        scheduledTime,
      });

      const response = await fetch(`/api/gps/first-call-location?${params}`);
      const result = await response.json();

      if (!response.ok) throw new Error(result.error);

      setData(result);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch location data');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const formatDistance = (feet: number) => {
    if (feet < 5280) {
      return `${feet.toLocaleString()} feet`;
    }
    const miles = feet / 5280;
    return `${miles.toFixed(2)} miles (${feet.toLocaleString()} feet)`;
  };

  // Calculate map bounds
  const getBounds = (): [[number, number], [number, number]] | null => {
    if (!data?.jobLocation) return null;

    if (data.truckLocation) {
      const latPadding = Math.abs(data.jobLocation.latitude - data.truckLocation.latitude) * 0.3 || 0.005;
      const lonPadding = Math.abs(data.jobLocation.longitude - data.truckLocation.longitude) * 0.3 || 0.005;

      return [
        [
          Math.min(data.jobLocation.latitude, data.truckLocation.latitude) - latPadding,
          Math.min(data.jobLocation.longitude, data.truckLocation.longitude) - lonPadding,
        ],
        [
          Math.max(data.jobLocation.latitude, data.truckLocation.latitude) + latPadding,
          Math.max(data.jobLocation.longitude, data.truckLocation.longitude) + lonPadding,
        ],
      ];
    }

    // Single point - just show job location with some padding
    return [
      [data.jobLocation.latitude - 0.005, data.jobLocation.longitude - 0.005],
      [data.jobLocation.latitude + 0.005, data.jobLocation.longitude + 0.005],
    ];
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900">
            First Call Location - {technicianName}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-200 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-8 h-8 text-gray-400 animate-spin" />
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
              {error}
            </div>
          ) : data ? (
            <>
              {/* Map */}
              {data.jobLocation && mapReady && (
                <div className="h-80 rounded-lg overflow-hidden border mb-4">
                  <MapContainer
                    bounds={getBounds() || undefined}
                    style={{ height: '100%', width: '100%' }}
                    scrollWheelZoom={true}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    {/* Job Location Marker (Blue) */}
                    <Marker
                      position={[data.jobLocation.latitude, data.jobLocation.longitude]}
                    >
                      <Popup>
                        <div className="text-sm">
                          <div className="font-semibold text-blue-600 flex items-center gap-1">
                            <MapPin className="w-4 h-4" />
                            Job Site
                          </div>
                          <div className="text-gray-600 mt-1">
                            {data.jobLocation.address || 'Address not available'}
                          </div>
                        </div>
                      </Popup>
                    </Marker>

                    {/* Truck Location Marker (Red) */}
                    {data.truckLocation && (
                      <Marker
                        position={[data.truckLocation.latitude, data.truckLocation.longitude]}
                      >
                        <Popup>
                          <div className="text-sm">
                            <div className="font-semibold text-red-600 flex items-center gap-1">
                              <Truck className="w-4 h-4" />
                              Truck Location
                            </div>
                            <div className="text-gray-600 mt-1">
                              {data.truckLocation.address || 'Address not available'}
                            </div>
                            <div className="text-gray-500 text-xs mt-1">
                              at {format(parseISO(data.truckLocation.timestamp), 'h:mm a')}
                            </div>
                          </div>
                        </Popup>
                      </Marker>
                    )}
                  </MapContainer>
                </div>
              )}

              {/* Info Section */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Date:</span>
                    <span className="ml-2 text-gray-900 font-medium">
                      {format(parseISO(jobDate), 'MMMM d, yyyy')}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Scheduled:</span>
                    <span className="ml-2 text-gray-900 font-medium">
                      {format(parseISO(scheduledTime), 'h:mm a')}
                    </span>
                  </div>
                </div>

                <hr />

                {/* Job Site */}
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <MapPin className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">Job Site</div>
                    <div className="text-sm text-gray-600">
                      {data.jobLocation?.address || 'Address not available'}
                    </div>
                  </div>
                </div>

                {/* Truck Location */}
                {data.truckLocation ? (
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Truck className="w-4 h-4 text-red-600" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        Truck Was Here
                        <span className="text-gray-500 font-normal ml-2">
                          at {format(parseISO(data.truckLocation.timestamp), 'h:mm a')}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600">
                        {data.truckLocation.address || 'Address not available'}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Truck className="w-4 h-4 text-gray-400" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-500">
                        No GPS data available
                      </div>
                      <div className="text-sm text-gray-400">
                        Truck location at scheduled time not recorded
                      </div>
                    </div>
                  </div>
                )}

                {/* Distance */}
                {data.truckLocation && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-yellow-700 font-medium">Distance from job:</span>
                      <span className="text-yellow-800 font-bold">
                        {formatDistance(data.truckLocation.distanceFromJobFeet)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No location data available
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
