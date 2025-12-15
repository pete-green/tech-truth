'use client';

import dynamic from 'next/dynamic';
import { ComponentProps } from 'react';

// Dynamically import react-leaflet components with SSR disabled
export const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => mod.MapContainer),
  { ssr: false }
);

export const TileLayer = dynamic(
  () => import('react-leaflet').then((mod) => mod.TileLayer),
  { ssr: false }
);

export const Marker = dynamic(
  () => import('react-leaflet').then((mod) => mod.Marker),
  { ssr: false }
);

export const Popup = dynamic(
  () => import('react-leaflet').then((mod) => mod.Popup),
  { ssr: false }
);

export const Circle = dynamic(
  () => import('react-leaflet').then((mod) => mod.Circle),
  { ssr: false }
);

export const Polygon = dynamic(
  () => import('react-leaflet').then((mod) => mod.Polygon),
  { ssr: false }
);

export const Polyline = dynamic(
  () => import('react-leaflet').then((mod) => mod.Polyline),
  { ssr: false }
);

// useMap hook needs to be wrapped in a component for dynamic import
// We'll create a map recenter component instead
export const MapRecenter = dynamic(
  () => import('./MapRecenter'),
  { ssr: false }
);

// Draggable marker component
export const DraggableMarker = dynamic(
  () => import('./DraggableMarker'),
  { ssr: false }
);

// Polygon drawing component
export const PolygonDrawer = dynamic(
  () => import('./PolygonDrawer'),
  { ssr: false }
);

// Re-export types for convenience
export type MapContainerProps = ComponentProps<typeof MapContainer>;
