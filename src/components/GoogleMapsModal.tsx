'use client';

import { useState } from 'react';
import { X, MapPin, Map, Layers, Eye, Building2, ExternalLink } from 'lucide-react';

interface GoogleMapsModalProps {
  isOpen: boolean;
  onClose: () => void;
  latitude: number;
  longitude: number;
  label: string;
  address?: string;
  technicianName?: string;
}

type MapTab = 'map' | 'satellite' | 'streetview' | 'nearby';

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || '';

function getEmbedUrl(
  lat: number,
  lng: number,
  tab: MapTab,
  apiKey: string
): string {
  const coords = `${lat},${lng}`;

  switch (tab) {
    case 'map':
      return `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=${coords}&maptype=roadmap&zoom=17`;
    case 'satellite':
      return `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=${coords}&maptype=satellite&zoom=18`;
    case 'streetview':
      return `https://www.google.com/maps/embed/v1/streetview?key=${apiKey}&location=${coords}&heading=0&pitch=0&fov=90`;
    case 'nearby':
      return `https://www.google.com/maps/embed/v1/search?key=${apiKey}&q=businesses+near+${coords}&zoom=16`;
    default:
      return `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=${coords}&maptype=roadmap&zoom=17`;
  }
}

const tabs: { id: MapTab; label: string; icon: typeof Map; description: string }[] = [
  { id: 'map', label: 'Map', icon: Map, description: 'Standard road map' },
  { id: 'satellite', label: 'Satellite', icon: Layers, description: 'Aerial imagery' },
  { id: 'streetview', label: 'Street View', icon: Eye, description: 'Ground-level view' },
  { id: 'nearby', label: 'Nearby', icon: Building2, description: 'Surrounding businesses' },
];

export default function GoogleMapsModal({
  isOpen,
  onClose,
  latitude,
  longitude,
  label,
  address,
  technicianName,
}: GoogleMapsModalProps) {
  const [activeTab, setActiveTab] = useState<MapTab>('map');

  if (!isOpen) return null;

  // Google Maps external link
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;

  // Check if API key is configured
  const hasApiKey = !!GOOGLE_MAPS_API_KEY;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
          <div className="flex items-start gap-2">
            <MapPin className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-gray-900">{label}</h3>
              {technicianName && (
                <p className="text-sm text-gray-600">{technicianName}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-200 rounded transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Address bar */}
        {address && (
          <div className="px-4 py-2 bg-gray-50 border-b text-sm text-gray-700">
            {address}
          </div>
        )}

        {/* Tab buttons */}
        <div className="flex border-b bg-white">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 px-3 py-2.5 flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
                title={tab.description}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Map embed */}
        <div className="relative">
          {hasApiKey ? (
            <iframe
              key={`${activeTab}-${latitude}-${longitude}`}
              src={getEmbedUrl(latitude, longitude, activeTab, GOOGLE_MAPS_API_KEY)}
              width="100%"
              height="400"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title={`Google Maps - ${tabs.find(t => t.id === activeTab)?.label}`}
            />
          ) : (
            <div className="h-[400px] flex items-center justify-center bg-gray-100">
              <div className="text-center p-4">
                <MapPin className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-600 font-medium">Google Maps API key not configured</p>
                <p className="text-sm text-gray-500 mt-1">
                  Add NEXT_PUBLIC_GOOGLE_MAPS_KEY to your environment variables
                </p>
                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-3 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open in Google Maps
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t bg-gray-50 flex items-center justify-between">
          <div className="text-xs text-gray-500">
            {latitude.toFixed(6)}, {longitude.toFixed(6)}
          </div>
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open in Google Maps
          </a>
        </div>
      </div>
    </div>
  );
}
