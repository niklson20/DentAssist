"use client";

import dynamic from "next/dynamic";

import { googleMapsSearchUrl } from "@/lib/google-maps";
import { cn } from "@/lib/utils";

export { googleMapsSearchUrl };

const ClinicLocationMapCanvas = dynamic(
  () => import("./clinic-location-map-canvas").then((mod) => mod.ClinicLocationMapCanvas),
  {
    ssr: false,
    loading: () => <div className="h-full min-h-44 bg-muted/30" aria-hidden />,
  },
);

type ClinicLocationMapProps = {
  address: string;
  latitude: number;
  longitude: number;
  className?: string;
};

export function ClinicLocationMap({
  address,
  latitude,
  longitude,
  className,
}: ClinicLocationMapProps) {
  return (
    <a
      href={googleMapsSearchUrl(address)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Otvori lokaciju u Google Maps"
      className={cn(
        "block min-h-44 overflow-hidden rounded-xl border border-border bg-card shadow-xs transition-opacity hover:opacity-95",
        className,
      )}
    >
      <ClinicLocationMapCanvas
        latitude={latitude}
        longitude={longitude}
        className="h-full min-h-44 w-full"
      />
    </a>
  );
}

export function hasClinicCoordinates(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): boolean {
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
  );
}
