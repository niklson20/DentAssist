"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

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
  const frameRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) {
      return;
    }

    // Below the lg breakpoint the map panel is display:none until "Mapa".
    // Leaflet keeps the size it measured at creation, so a hidden start stays gray.
    const update = () => {
      const shown = frame.offsetWidth > 0 && frame.offsetHeight > 0;
      setReady((current) => (current === shown ? current : shown));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={frameRef} className={className}>
      {ready ? (
        <DirectoryMapCanvas clinics={clinics} className="h-full min-h-80" />
      ) : (
        <div className="h-full min-h-80 rounded-lg border border-border bg-muted/30" aria-hidden />
      )}
    </div>
  );
}

type DirectoryCoords = { lat: number; lng: number };

type DirectoryCityFilterProps = {
  cities: string[];
  selectedCity: string;
  coords?: DirectoryCoords | null;
  pretraga?: string;
};

export function DirectoryCityFilter({
  cities,
  selectedCity,
  coords,
  pretraga,
}: DirectoryCityFilterProps) {
  const router = useRouter();

  const filterActive = Boolean(selectedCity || pretraga || coords);

  function onCityChange(event: ChangeEvent<HTMLSelectElement>) {
    const city = event.target.value;
    router.push(
      directoryHref({
        grad: city || undefined,
        coords: city ? coords : null,
      }),
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <select
        aria-label="Grad"
        value={selectedCity}
        onChange={onCityChange}
        disabled={cities.length === 0}
        className="h-9 w-44 rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
      >
        <option value="">Svi gradovi</option>
        {cities.map((city) => (
          <option key={city} value={city}>
            {city}
          </option>
        ))}
      </select>
      <NearMeButton grad={selectedCity || undefined} pretraga={pretraga} />
      {filterActive ? (
        <Button type="button" variant="ghost" onClick={() => router.push("/")}>
          Poništi filter
        </Button>
      ) : null}
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
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
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
