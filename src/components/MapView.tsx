import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const DEFAULT_CENTER: [number, number] = [37.7749, -122.4194];
const DATA_BOUNDS = L.latLngBounds([36.85, -123.35], [38.72, -121.2]);
const WORLD_MASK: L.LatLngTuple[] = [
  [85, -180],
  [85, 180],
  [-85, 180],
  [-85, -180],
];

type Point = [number, number];

type MapViewProps = {
  center: Point;
  compareCenter: Point | null;
  focusCenter: Point;
  isLoading: boolean;
  radiusKm: number;
  onSelect: (value: Point) => void;
};

const primarySelectionIcon = L.divIcon({
  className: "selection-marker-shell",
  html: `
    <div class="selection-marker">
      <span class="selection-pulse selection-pulse-outer"></span>
      <span class="selection-pulse selection-pulse-inner"></span>
      <span class="selection-core"></span>
    </div>
  `,
  iconSize: [42, 42],
  iconAnchor: [21, 21],
});

const compareSelectionIcon = L.divIcon({
  className: "selection-marker-shell selection-marker-shell-compare",
  html: `
    <div class="selection-marker selection-marker-compare">
      <span class="selection-pulse selection-pulse-outer selection-pulse-outer-compare"></span>
      <span class="selection-pulse selection-pulse-inner selection-pulse-inner-compare"></span>
      <span class="selection-core selection-core-compare"></span>
    </div>
  `,
  iconSize: [42, 42],
  iconAnchor: [21, 21],
});

export default function MapView({
  center,
  compareCenter,
  focusCenter,
  isLoading,
  radiusKm,
  onSelect,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const compareMarkerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const compareCircleRef = useRef<L.Circle | null>(null);
  const haloRef = useRef<L.Circle | null>(null);
  const maskRef = useRef<L.Polygon | null>(null);
  const boundsOutlineRef = useRef<L.Rectangle | null>(null);
  const popupRef = useRef<L.Popup | null>(null);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = L.map(containerRef.current, {
      zoomControl: true,
      minZoom: 5.5,
      zoomSnap: 0.5,
    }).setView(DEFAULT_CENTER, 9);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 18,
    }).addTo(map);

    const southWest = DATA_BOUNDS.getSouthWest();
    const northEast = DATA_BOUNDS.getNorthEast();
    const innerHole: L.LatLngTuple[] = [
      [southWest.lat, southWest.lng],
      [northEast.lat, southWest.lng],
      [northEast.lat, northEast.lng],
      [southWest.lat, northEast.lng],
    ];

    maskRef.current = L.polygon([WORLD_MASK, innerHole], {
      stroke: false,
      fillColor: "#13213f",
      fillOpacity: 0.16,
      interactive: false,
      className: "map-dataset-mask",
    }).addTo(map);

    boundsOutlineRef.current = L.rectangle(DATA_BOUNDS, {
      color: "#ff9f59",
      weight: 1.5,
      opacity: 0.85,
      fillOpacity: 0,
      dashArray: "6 6",
      interactive: false,
      className: "map-dataset-outline",
    }).addTo(map);

    popupRef.current = L.popup({
      closeButton: false,
      className: "dataset-popup",
      offset: [0, -8],
    });

    map.on("click", (event: L.LeafletMouseEvent) => {
      if (DATA_BOUNDS.contains(event.latlng)) {
        popupRef.current?.remove();
        onSelectRef.current([event.latlng.lat, event.latlng.lng]);
      } else if (popupRef.current) {
        popupRef.current
          .setLatLng(event.latlng)
          .setContent(
            "<strong>Outside dataset bounds.</strong><br/>Map interaction is limited to the provided North California dataset.",
          )
          .openOn(map);
      }
    });

    mapRef.current = map;
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    if (!markerRef.current) {
      markerRef.current = L.marker(center, {
        icon: primarySelectionIcon,
        interactive: false,
        keyboard: false,
      }).addTo(map);
    } else {
      markerRef.current.setLatLng(center);
    }

    if (!circleRef.current) {
      circleRef.current = L.circle(center, {
        radius: radiusKm * 1000,
        color: "#ff7a18",
        weight: 2,
        fillColor: "#ff8d36",
        fillOpacity: 0.12,
      }).addTo(map);
    } else {
      circleRef.current.setLatLng(center);
      circleRef.current.setRadius(radiusKm * 1000);
    }

    if (!haloRef.current) {
      haloRef.current = L.circle(center, {
        radius: Math.max(radiusKm * 160, 650),
        color: "#f4b06b",
        weight: 1,
        opacity: 0.65,
        fillOpacity: 0,
        interactive: false,
      }).addTo(map);
    } else {
      haloRef.current.setLatLng(center);
      haloRef.current.setRadius(Math.max(radiusKm * 160, 650));
    }

    if (compareCenter) {
      if (!compareMarkerRef.current) {
        compareMarkerRef.current = L.marker(compareCenter, {
          icon: compareSelectionIcon,
          interactive: false,
          keyboard: false,
        }).addTo(map);
      } else {
        compareMarkerRef.current.setLatLng(compareCenter);
      }

      if (!compareCircleRef.current) {
        compareCircleRef.current = L.circle(compareCenter, {
          radius: radiusKm * 1000,
          color: "#6c7dff",
          weight: 2,
          fillColor: "#8a96ff",
          fillOpacity: 0.08,
          dashArray: "8 8",
        }).addTo(map);
      } else {
        compareCircleRef.current.setLatLng(compareCenter);
        compareCircleRef.current.setRadius(radiusKm * 1000);
      }
    } else {
      compareMarkerRef.current?.remove();
      compareMarkerRef.current = null;
      compareCircleRef.current?.remove();
      compareCircleRef.current = null;
    }
  }, [center, compareCenter, radiusKm]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    map.flyTo(focusCenter, map.getZoom(), {
      animate: true,
      duration: 0.75,
      easeLinearity: 0.2,
    });
  }, [focusCenter]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    container.classList.toggle("is-computing", isLoading);
  }, [isLoading]);

  return <div className="map" ref={containerRef} />;
}
