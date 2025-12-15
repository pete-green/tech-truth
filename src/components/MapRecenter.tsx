'use client';

import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

interface MapRecenterProps {
  lat: number;
  lon: number;
  zoom?: number;
}

export default function MapRecenter({ lat, lon, zoom = 17 }: MapRecenterProps) {
  const map = useMap();

  useEffect(() => {
    map.setView([lat, lon], zoom);
  }, [lat, lon, zoom, map]);

  return null;
}
