"use client";

import "leaflet/dist/leaflet.css";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";

import { Button } from "@/components/ui/button";
import type { ClinicDirectoryHit } from "@/lib/queries/public";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

const defaultIcon = L.icon({
  iconUrl: markerIcon.src,
  iconRetinaUrl: markerIcon2x.src,
  shadowUrl: markerShadow.src,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

type DirectoryViewMode = "lista" | "mapa";

type DirectoryMapProps = {
  clinics: ClinicDirectoryHit[];
  className?: string;
};

function subscribeToClientMount() {
  return () => {};
}

function getClientSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

export function DirectoryMapPanel({ clinics, className }: DirectoryMapProps) {
  const mounted = useSyncExternalStore(
    subscribeToClientMount,
    getClientSnapshot,
    getServerSnapshot,
  );

  if (!mounted) {
    return (
      <div
        className={`min-h-80 rounded-lg border border-border bg-muted/30 ${className ?? ""}`}
        aria-hidden
      />
    );
  }

  return <DirectoryMap clinics={clinics} className={className} />;
}

function DirectoryMap({ clinics, className }: DirectoryMapProps) {
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
    <div
      className={className}
      aria-label="Mapa ordinacija"
    >
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
          {pinned.map((clinic) => (
            <Marker
              key={clinic.slug}
              position={[clinic.latitude!, clinic.longitude!]}
              icon={defaultIcon}
            >
              <Popup>
                <div className="space-y-1 text-sm">
                  <p className="font-medium">{clinic.name}</p>
                  <p className="text-muted-foreground">{clinic.address}</p>
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
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
  }, [bounds, map]);

  return null;
}

type NearMeButtonProps = {
  buildHref: (coords: { lat: number; lng: number }) => string;
};

export function NearMeButton({ buildHref }: NearMeButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    if (!navigator.geolocation) {
      setError("Ovaj uređaj ne podržava lokaciju.");
      return;
    }
    setPending(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPending(false);
        router.push(
          buildHref({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          }),
        );
      },
      () => {
        setPending(false);
        setError("Lokacija nije dostupna. Dozvolite pristup u podešavanjima uređaja.");
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Button type="button" variant="outline" onClick={onClick} disabled={pending}>
        {pending ? "Tražim lokaciju…" : "Blizu mene"}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

type ViewModeTabsProps = {
  mode: DirectoryViewMode;
  listaHref: string;
  mapaHref: string;
};

export function ViewModeTabs({ mode, listaHref, mapaHref }: ViewModeTabsProps) {
  return (
    <div className="flex gap-2 lg:hidden" role="tablist" aria-label="Prikaz imenika">
      <Link
        href={listaHref}
        role="tab"
        aria-selected={mode === "lista"}
        className={
          mode === "lista"
            ? "inline-flex rounded-md border border-primary bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
            : "inline-flex rounded-md border border-border bg-card px-3 py-1.5 text-sm text-card-foreground shadow-xs hover:bg-muted"
        }
      >
        Lista
      </Link>
      <Link
        href={mapaHref}
        role="tab"
        aria-selected={mode === "mapa"}
        className={
          mode === "mapa"
            ? "inline-flex rounded-md border border-primary bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
            : "inline-flex rounded-md border border-border bg-card px-3 py-1.5 text-sm text-card-foreground shadow-xs hover:bg-muted"
        }
      >
        Mapa
      </Link>
    </div>
  );
}

export function formatDistanceKm(distanceKm: number | null): string | null {
  if (distanceKm === null || !Number.isFinite(distanceKm)) {
    return null;
  }
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }
  return `${distanceKm.toFixed(1)} km`;
}
