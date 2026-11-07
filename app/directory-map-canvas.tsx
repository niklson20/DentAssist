"use client";

import "leaflet/dist/leaflet.css";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";

import { formatDirectoryAddress } from "@/app/directory-href";
import type { ClinicDirectoryHit } from "@/lib/queries/public";

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

type DirectoryMapProps = {
  clinics: ClinicDirectoryHit[];
  className?: string;
};

export function DirectoryMapCanvas({ clinics, className }: DirectoryMapProps) {
  const pinned = useMemo(
    () =>
      clinics.filter(
        (clinic) =>
          clinic.latitude !== null &&
          clinic.longitude !== null &&
          Number.isFinite(clinic.latitude) &&
          Number.isFinite(clinic.longitude),
      ),
    [clinics],
  );

  const bounds = useMemo(() => {
    if (pinned.length === 0) {
      return null;
    }
    return L.latLngBounds(pinned.map((clinic) => [clinic.latitude!, clinic.longitude!]));
  }, [pinned]);

  const center = bounds?.getCenter() ?? L.latLng(44.8176, 20.4569);
  const zoom = bounds ? undefined : 7;

  return (
    <div className={className} aria-label="Mapa ordinacija">
      {pinned.length === 0 ? (
        <div className="flex h-full min-h-64 items-center justify-center rounded-lg border border-border bg-muted/30 px-4 text-center text-sm text-muted-foreground">
          Nema ordinacija sa prikazom na mapi za ovaj izbor.
        </div>
      ) : (
        <MapContainer
          center={center}
          zoom={zoom ?? 12}
          scrollWheelZoom
          className="z-0 h-full min-h-64 w-full rounded-lg border border-border"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {bounds ? <FitBounds bounds={bounds} /> : null}
          <WatchMapSize />
          {pinned.map((clinic) => (
            <Marker
              key={clinic.slug}
              position={[clinic.latitude!, clinic.longitude!]}
              icon={defaultIcon}
            >
              <Popup>
                <div className="space-y-1 text-sm">
                  <p className="font-medium">{clinic.name}</p>
                  <p className="text-muted-foreground">
                    {formatDirectoryAddress(clinic.address, clinic.city)}
                  </p>
                  {clinic.phone ? (
                    <p>
                      <a href={`tel:${clinic.phone}`} className="text-primary underline-offset-4 hover:underline">
                        {clinic.phone}
                      </a>
                    </p>
                  ) : null}
                  <Link
                    href={`/ordinacije/${encodeURIComponent(clinic.slug)}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Otvori ordinaciju
                  </Link>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      )}
    </div>
  );
}

function FitBounds({ bounds }: { bounds: L.LatLngBounds }) {
  const map = useMap();

  useEffect(() => {
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15, animate: false });
  }, [bounds, map]);

  return null;
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
