"use client";

import "leaflet/dist/leaflet.css";

import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

function markerAssetUrl(asset: string | { src: string }): string {
  return typeof asset === "string" ? asset : asset.src;
}

const defaultIcon = L.icon({
  iconUrl: markerAssetUrl(markerIcon),
  iconRetinaUrl: markerAssetUrl(markerIcon2x),
  shadowUrl: markerAssetUrl(markerShadow),
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

type ClinicLocationMapCanvasProps = {
  latitude: number;
  longitude: number;
  className?: string;
};

export function ClinicLocationMapCanvas({
  latitude,
  longitude,
  className,
}: ClinicLocationMapCanvasProps) {
  return (
    <div className={className} aria-hidden="true">
      <MapContainer
        center={[latitude, longitude]}
        zoom={16}
        scrollWheelZoom={false}
        dragging={false}
        doubleClickZoom={false}
        boxZoom={false}
        keyboard={false}
        touchZoom={false}
        zoomControl={false}
        attributionControl={false}
        className="pointer-events-none z-0 h-full w-full"
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Marker position={[latitude, longitude]} icon={defaultIcon} />
        <WatchMapSize />
      </MapContainer>
    </div>
  );
}

function WatchMapSize() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);

  return null;
}
