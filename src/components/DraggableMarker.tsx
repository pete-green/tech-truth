'use client';

import { useRef, useMemo, useEffect, useState } from 'react';
import { Marker } from 'react-leaflet';
import L from 'leaflet';

interface DraggableMarkerProps {
  position: [number, number];
  onPositionChange: (lat: number, lng: number) => void;
}

export default function DraggableMarker({ position, onPositionChange }: DraggableMarkerProps) {
  const markerRef = useRef<any>(null);
  const [icon, setIcon] = useState<L.Icon | null>(null);

  useEffect(() => {
    const markerIcon = new L.Icon({
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });
    setIcon(markerIcon);
  }, []);

  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (marker != null) {
          const pos = marker.getLatLng();
          onPositionChange(pos.lat, pos.lng);
        }
      },
    }),
    [onPositionChange]
  );

  if (!icon) return null;

  return (
    <Marker
      draggable={true}
      eventHandlers={eventHandlers}
      position={position}
      ref={markerRef}
      icon={icon}
    />
  );
}
