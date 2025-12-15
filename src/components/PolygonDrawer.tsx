'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

interface PolygonDrawerProps {
  points: [number, number][];
  onPointsChange: (points: [number, number][]) => void;
  isDrawing: boolean;
}

export default function PolygonDrawer({ points, onPointsChange, isDrawing }: PolygonDrawerProps) {
  const map = useMap();
  const markersRef = useRef<L.Marker[]>([]);
  const polygonRef = useRef<L.Polygon | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);

  // Create a small draggable marker icon
  const vertexIcon = L.divIcon({
    className: 'polygon-vertex',
    html: '<div style="width: 12px; height: 12px; background: #3b82f6; border: 2px solid white; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.3); cursor: move;"></div>',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });

  // Handle map clicks to add points
  useMapEvents({
    click(e) {
      if (!isDrawing) return;

      const newPoint: [number, number] = [e.latlng.lat, e.latlng.lng];
      onPointsChange([...points, newPoint]);
    },
  });

  // Update polygon and markers when points change
  const updateVisualization = useCallback(() => {
    // Clear existing markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // Clear existing polygon/polyline
    if (polygonRef.current) {
      polygonRef.current.remove();
      polygonRef.current = null;
    }
    if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }

    if (points.length === 0) return;

    // Create markers for each point
    points.forEach((point, index) => {
      const marker = L.marker(point, {
        icon: vertexIcon,
        draggable: true,
      }).addTo(map);

      // Handle drag to update point position
      marker.on('dragend', () => {
        const newLatLng = marker.getLatLng();
        const newPoints = [...points];
        newPoints[index] = [newLatLng.lat, newLatLng.lng];
        onPointsChange(newPoints);
      });

      // Handle click on marker to delete it (if not first point and we have more than 3 points)
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (points.length > 3) {
          const newPoints = points.filter((_, i) => i !== index);
          onPointsChange(newPoints);
        }
      });

      markersRef.current.push(marker);
    });

    // Draw the shape
    if (points.length >= 3) {
      // Draw closed polygon
      polygonRef.current = L.polygon(points, {
        color: '#3b82f6',
        weight: 2,
        fillColor: '#3b82f6',
        fillOpacity: 0.2,
      }).addTo(map);
    } else if (points.length >= 2) {
      // Draw open polyline
      polylineRef.current = L.polyline(points, {
        color: '#3b82f6',
        weight: 2,
        dashArray: '5, 5',
      }).addTo(map);
    }
  }, [map, points, onPointsChange, vertexIcon]);

  useEffect(() => {
    updateVisualization();

    // Cleanup on unmount
    return () => {
      markersRef.current.forEach(marker => marker.remove());
      if (polygonRef.current) polygonRef.current.remove();
      if (polylineRef.current) polylineRef.current.remove();
    };
  }, [updateVisualization]);

  // Change cursor when drawing
  useEffect(() => {
    const container = map.getContainer();
    if (isDrawing) {
      container.style.cursor = 'crosshair';
    } else {
      container.style.cursor = '';
    }

    return () => {
      container.style.cursor = '';
    };
  }, [map, isDrawing]);

  return null;
}
