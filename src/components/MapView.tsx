import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const DEFAULT_CENTER: [number, number] = [37.7749, -122.4194];

type MapViewProps = {
  center: [number, number];
  radiusKm: number;
  onSelect: (value: [number, number]) => void;
};

export default function MapView({ center, radiusKm, onSelect }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = L.map(containerRef.current, {
      zoomControl: true,
    }).setView(DEFAULT_CENTER, 9);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 18,
    }).addTo(map);

    map.on("click", (event: L.LeafletMouseEvent) => {
      onSelect([event.latlng.lat, event.latlng.lng]);
    });

    mapRef.current = map;
  }, [onSelect]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    if (!markerRef.current) {
      markerRef.current = L.circleMarker(center, {
        radius: 7,
        color: "#0f172a",
        weight: 2,
        fillColor: "#f97316",
        fillOpacity: 0.95,
      }).addTo(map);
    } else {
      markerRef.current.setLatLng(center);
    }

    if (!circleRef.current) {
      circleRef.current = L.circle(center, {
        radius: radiusKm * 1000,
        color: "#f97316",
        weight: 2,
        fillColor: "#fdba74",
        fillOpacity: 0.2,
      }).addTo(map);
    } else {
      circleRef.current.setLatLng(center);
      circleRef.current.setRadius(radiusKm * 1000);
    }
  }, [center, radiusKm]);

  return <div className="map" ref={containerRef} />;
}
