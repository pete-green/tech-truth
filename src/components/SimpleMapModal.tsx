'use client';

import { useEffect, useState } from 'react';
import { X, MapPin } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup } from './LeafletMapWrapper';

interface SimpleMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  latitude: number;
  longitude: number;
  label: string;
  address?: string;
  technicianName?: string;
}

export default function SimpleMapModal({
  isOpen,
  onClose,
  latitude,
  longitude,
  label,
  address,
  technicianName,
}: SimpleMapModalProps) {
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

  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure modal is visible before initializing map
      const timer = setTimeout(() => setMapReady(true), 100);
      return () => clearTimeout(timer);
    } else {
      setMapReady(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Google Maps link
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
          <div>
            <h3 className="font-semibold text-gray-900">{label}</h3>
            {technicianName && (
              <p className="text-sm text-gray-600">{technicianName}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-200 rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Address */}
          {address && (
            <div className="mb-4 flex items-start gap-2 text-sm">
              <MapPin className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-gray-700">{address}</span>
                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 text-blue-600 hover:underline"
                >
                  Open in Google Maps
                </a>
              </div>
            </div>
          )}

          {/* Map */}
          <div className="h-80 rounded-lg overflow-hidden border border-gray-200">
            {mapReady && icon ? (
              <MapContainer
                center={[latitude, longitude]}
                zoom={16}
                className="h-full w-full"
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker position={[latitude, longitude]} icon={icon}>
                  <Popup>
                    <div className="text-sm">
                      <p className="font-medium">{label}</p>
                      {address && <p className="text-gray-600">{address}</p>}
                    </div>
                  </Popup>
                </Marker>
              </MapContainer>
            ) : (
              <div className="h-full flex items-center justify-center bg-gray-100">
                <span className="text-gray-500">Loading map...</span>
              </div>
            )}
          </div>

          {/* Coordinates */}
          <div className="mt-3 text-xs text-gray-500">
            Coordinates: {latitude.toFixed(6)}, {longitude.toFixed(6)}
          </div>
        </div>
      </div>
    </div>
  );
}
