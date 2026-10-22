import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import {
  DirectoryMapPanel,
  formatDistanceKm,
  NearMeButton,
  ViewModeTabs,
} from "@/app/directory-map";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  listDirectoryCities,
  searchDirectoryClinics,
  type ClinicDirectoryHit,
} from "@/lib/queries/public";

export const metadata: Metadata = {
  title: "Imenik — DentAssist",
  description: "Pronađite stomatološku ordinaciju sa online zakazivanjem",
};

type DirectoryViewMode = "lista" | "mapa";

type PageProps = {
  searchParams: Promise<{
    grad?: string;
    pretraga?: string;
    lat?: string;
    lng?: string;
    prikaz?: string;
  }>;
};

export default async function DirectoryPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const selectedCity = params.grad?.trim() ?? "";
  const nameQuery = params.pretraga?.trim() ?? "";
  const viewMode: DirectoryViewMode = params.prikaz === "mapa" ? "mapa" : "lista";
  const userCoords = parseCoords(params.lat, params.lng);

  const cities = await listDirectoryCities();
  let clinics: ClinicDirectoryHit[] = [];
  if (nameQuery) {
    clinics = await searchDirectoryClinics({
      name: nameQuery,
      lat: userCoords?.lat,
      lng: userCoords?.lng,
    });
  } else if (selectedCity) {
    clinics = await searchDirectoryClinics({
      city: selectedCity,
      lat: userCoords?.lat,
      lng: userCoords?.lng,
    });
  }

  const staffEntryUrl = await resolveStaffEntryUrl();
  const showEmptyCity =
    Boolean(selectedCity) && !nameQuery && clinics.length === 0;
  const showResults = Boolean(selectedCity || nameQuery);
  const showListOnNarrow = viewMode === "lista";
  const showMapOnNarrow = viewMode === "mapa";

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Imenik ordinacija</h1>
          <p className="text-sm text-muted-foreground">
            Izaberite grad ili pretražite naziv ordinacije u celoj Srbiji.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-sm font-medium">Pretraga naziva</h2>
          <form className="flex flex-col gap-3 sm:flex-row" method="get">
            {selectedCity ? <input type="hidden" name="grad" value={selectedCity} /> : null}
            {userCoords ? (
              <>
                <input type="hidden" name="lat" value={String(userCoords.lat)} />
                <input type="hidden" name="lng" value={String(userCoords.lng)} />
              </>
            ) : null}
            <Input
              name="pretraga"
              type="search"
              placeholder="Naziv ordinacije"
              defaultValue={nameQuery}
              className="flex-1"
              autoComplete="off"
            />
            <Button type="submit">Pretraži</Button>
          </form>
          {nameQuery ? (
            <p className="text-sm text-muted-foreground">
              Rezultati pretrage za „{nameQuery}“ u celoj zemlji.
              {selectedCity ? (
                <>
                  {" "}
                  <Link
                    href={directoryHref({ grad: selectedCity, coords: userCoords })}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Vrati se na grad {selectedCity}
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}
        </section>

        {!nameQuery ? (
          <section className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-medium">Grad</h2>
              <NearMeButton buildHref={(coords) => directoryHref({ grad: selectedCity, coords })} />
            </div>
            {cities.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Trenutno nema ordinacija sa online zakazivanjem.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {cities.map((city) => {
                  const active = city === selectedCity;
                  return (
                    <li key={city}>
                      <Link
                        href={directoryHref({ grad: city, coords: userCoords })}
                        className={
                          active
                            ? "inline-flex rounded-md border border-primary bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                            : "inline-flex rounded-md border border-border bg-card px-3 py-1.5 text-sm text-card-foreground shadow-xs hover:bg-muted"
                        }
                      >
                        {city}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : (
          <NearMeButton
            buildHref={(coords) =>
              directoryHref({ grad: selectedCity, pretraga: nameQuery, coords })
            }
          />
        )}

        {showResults ? (
          <section className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-medium">
                {nameQuery ? "Ordinacije" : `Ordinacije u gradu ${selectedCity}`}
              </h2>
              <ViewModeTabs
                mode={viewMode}
                listaHref={directoryHref({
                  grad: selectedCity,
                  pretraga: nameQuery,
                  coords: userCoords,
                  prikaz: "lista",
                })}
                mapaHref={directoryHref({
                  grad: selectedCity,
                  pretraga: nameQuery,
                  coords: userCoords,
                  prikaz: "mapa",
                })}
              />
            </div>
            {showEmptyCity ? (
              <p className="text-sm text-muted-foreground">
                U ovom gradu nema ordinacija sa online zakazivanjem.
              </p>
            ) : null}
            {!showEmptyCity && clinics.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {nameQuery
                  ? "Nema ordinacija koje odgovaraju pretrazi."
                  : "Izaberite grad da vidite ordinacije."}
              </p>
            ) : null}
            {!showEmptyCity && clinics.length > 0 ? (
              <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
                <ul
                  className={`grid gap-3 ${showListOnNarrow ? "grid" : "hidden"} lg:grid`}
                >
                  {clinics.map((clinic) => {
                    const distanceLabel = formatDistanceKm(clinic.distanceKm);
                    return (
                      <li key={clinic.slug}>
                        <Link
                          href={`/ordinacije/${encodeURIComponent(clinic.slug)}`}
                          className="block rounded-lg border border-border bg-card p-4 text-card-foreground shadow-xs transition-colors hover:bg-muted/50"
                        >
                          <p className="font-medium">{clinic.name}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{clinic.address}</p>
                          {clinic.phone ? (
                            <p className="mt-2 text-sm text-muted-foreground">{clinic.phone}</p>
                          ) : null}
                          {distanceLabel ? (
                            <p className="mt-2 text-sm text-muted-foreground">
                              Udaljenost: {distanceLabel}
                            </p>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                <DirectoryMapPanel
                  clinics={clinics}
                  className={`min-h-80 ${showMapOnNarrow ? "block" : "hidden"} lg:block`}
                />
              </div>
            ) : null}
          </section>
        ) : (
          <p className="text-sm text-muted-foreground">Prvo izaberite grad iz liste.</p>
        )}
      </main>

      <footer className="border-t border-border px-4 py-6">
        <div className="mx-auto w-full max-w-6xl">
          <Link
            href={staffEntryUrl}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Za ordinacije
          </Link>
        </div>
      </footer>
    </div>
  );
}

type Coords = { lat: number; lng: number };

function parseCoords(latRaw?: string, lngRaw?: string): Coords | null {
  if (!latRaw || !lngRaw) {
    return null;
  }
  const lat = Number.parseFloat(latRaw);
  const lng = Number.parseFloat(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }
  return { lat, lng };
}

function directoryHref(input: {
  grad?: string;
  pretraga?: string;
  coords?: Coords | null;
  prikaz?: DirectoryViewMode;
}): string {
  const params = new URLSearchParams();
  if (input.grad) {
    params.set("grad", input.grad);
  }
  if (input.pretraga) {
    params.set("pretraga", input.pretraga);
  }
  if (input.coords) {
    params.set("lat", String(input.coords.lat));
    params.set("lng", String(input.coords.lng));
  }
  if (input.prikaz) {
    params.set("prikaz", input.prikaz);
  }
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

async function resolveStaffEntryUrl(): Promise<string> {
  const fromEnv = process.env.STAFF_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }

  const store = await headers();
  const host = store.get("x-forwarded-host") ?? store.get("host");
  if (!host) {
    return "/za-ordinacije";
  }
  const proto =
    store.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`.replace(/\/$/, "");
}
