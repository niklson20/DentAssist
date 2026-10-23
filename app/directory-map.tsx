"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { directoryHref, type DirectoryViewMode } from "@/app/directory-href";
import { Button } from "@/components/ui/button";
import type { ClinicDirectoryHit } from "@/lib/queries/public";

const DirectoryMapCanvas = dynamic(
  () => import("./directory-map-canvas").then((mod) => mod.DirectoryMapCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-80 rounded-lg border border-border bg-muted/30" aria-hidden />
    ),
  },
);

type DirectoryMapProps = {
  clinics: ClinicDirectoryHit[];
  className?: string;
};

export function DirectoryMapPanel({ clinics, className }: DirectoryMapProps) {
  return (
    <div className={className}>
      <DirectoryMapCanvas clinics={clinics} className="h-full min-h-80" />
    </div>
  );
}

type NearMeButtonProps = {
  grad?: string;
  pretraga?: string;
};

export function NearMeButton({ grad, pretraga }: NearMeButtonProps) {
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
          directoryHref({
            grad,
            pretraga,
            coords: {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            },
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
