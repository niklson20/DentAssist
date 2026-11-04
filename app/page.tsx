import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import {
  directoryHref,
  DIRECTORY_NEAR_ME_RADIUS_KM,
  formatDirectoryAddress,
  formatDistanceKm,
  paginateDirectory,
  parseDirectoryPage,
  type DirectoryViewMode,
} from "@/app/directory-href";
import { DirectoryCityFilter, DirectoryMapPanel, ViewModeTabs } from "@/app/directory-map";
import { PublicSiteNav } from "@/app/ordinacije/public-site-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  listDirectoryCities,
  searchDirectoryClinics,
} from "@/lib/queries/public";
import { staffEntryHref } from "@/lib/staff-entry";

export const metadata: Metadata = {
  title: "Imenik — DentAssist",
  description: "Pronađite stomatološku ordinaciju sa online zakazivanjem",
};

type PageProps = {
  searchParams: Promise<{
    grad?: string;
    pretraga?: string;
    lat?: string;
    lng?: string;
    prikaz?: string;
    strana?: string;
  }>;
};

export default async function DirectoryPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const selectedCity = params.grad?.trim() ?? "";
  const nameQuery = params.pretraga?.trim() ?? "";
  const viewMode: DirectoryViewMode = params.prikaz === "mapa" ? "mapa" : "lista";
  const userCoords = parseCoords(params.lat, params.lng);

  const cities = await listDirectoryCities();
  const located = userCoords !== null;
  const clinics = await searchDirectoryClinics({
    name: nameQuery || undefined,
    city: nameQuery ? undefined : selectedCity || undefined,
    lat: userCoords?.lat,
    lng: userCoords?.lng,
  });
  const directoryPage = paginateDirectory(clinics, parseDirectoryPage(params.strana));

  const staffEntryUrl = await resolveStaffEntryUrl();
  const hasFilter = Boolean(selectedCity || nameQuery || located);
  const showMap = clinics.length > 0 && Boolean(nameQuery || selectedCity || located);
  const showDirectory = clinics.length > 0 || hasFilter;
  const showListOnNarrow = !showMap || viewMode === "lista";
  const showMapOnNarrow = showMap && viewMode === "mapa";

  function pageHref(strana: number, prikaz?: DirectoryViewMode) {
    return directoryHref({
      grad: selectedCity,
      pretraga: nameQuery,
      coords: userCoords,
      prikaz: showMap ? (prikaz ?? viewMode) : undefined,
      strana,
    });
  }

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <PublicSiteNav />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between lg:gap-12">
          <header className="min-w-0 space-y-2 lg:flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">Imenik ordinacija</h1>
          </header>

          <section className="w-full space-y-3 lg:w-[28rem] lg:shrink-0">
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
                placeholder="Pretraži ordinaciju"
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
        </div>

        <section className="space-y-3">
          <DirectoryCityFilter
            cities={cities}
            selectedCity={selectedCity}
            coords={userCoords}
            pretraga={nameQuery || undefined}
          />
          {cities.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Trenutno nema ordinacija sa online zakazivanjem.
            </p>
          ) : null}
        </section>

        {showDirectory ? (
          <section className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-medium">
                {nameQuery
                  ? "Ordinacije"
                  : selectedCity
                    ? `Ordinacije u gradu ${selectedCity}`
                    : located
                      ? "Najbliže ordinacije"
                      : "Ordinacije"}
              </h2>
              {showMap ? (
                <ViewModeTabs
                  mode={viewMode}
                  listaHref={pageHref(directoryPage.page, "lista")}
                  mapaHref={pageHref(directoryPage.page, "mapa")}
                />
              ) : null}
            </div>
            {clinics.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {nameQuery
                  ? "Nema ordinacija koje odgovaraju pretrazi."
                  : selectedCity
                    ? "U ovom gradu nema ordinacija sa online zakazivanjem."
                    : `U krugu od ${DIRECTORY_NEAR_ME_RADIUS_KM} km nema ordinacija sa online zakazivanjem.`}
              </p>
            ) : (
              <div className={showMap ? "grid gap-6 lg:grid-cols-2 lg:items-start" : "space-y-4"}>
                <div className={`space-y-4 ${showListOnNarrow ? "block" : "hidden"} lg:block`}>
                  <ul className="grid gap-3">
                    {directoryPage.items.map((clinic) => {
                      const distanceLabel = formatDistanceKm(clinic.distanceKm);
                      return (
                        <li key={clinic.slug}>
                          <Link
                            href={`/ordinacije/${encodeURIComponent(clinic.slug)}`}
                            className="block rounded-lg border border-border bg-card p-4 text-card-foreground shadow-xs transition-colors hover:bg-muted/50"
                          >
                            <p className="font-medium">{clinic.name}</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {formatDirectoryAddress(clinic.address, clinic.city)}
                            </p>
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
                  <DirectoryPagination
                    page={directoryPage.page}
                    pageCount={directoryPage.pageCount}
                    hrefFor={(strana) => pageHref(strana)}
                  />
                </div>
                {showMap ? (
                  <DirectoryMapPanel
                    clinics={clinics}
                    className={`min-h-80 ${showMapOnNarrow ? "block" : "hidden"} lg:block`}
                  />
                ) : null}
              </div>
            )}
          </section>
        ) : null}
      </main>

      <footer className="border-t border-border px-4 py-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href={staffEntryUrl}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Za ordinacije
          </Link>
          <p className="text-sm text-muted-foreground">© {copyrightYear()} DentAssist</p>
        </div>
      </footer>
    </div>
  );
}

function DirectoryPagination({
  page,
  pageCount,
  hrefFor,
}: {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
}) {
  if (pageCount <= 1) {
    return null;
  }

  return (
    <nav aria-label="Stranice" className="flex flex-wrap gap-2">
      {Array.from({ length: pageCount }, (_, index) => {
        const number = index + 1;
        const current = number === page;
        return (
          <Link
            key={number}
            href={hrefFor(number)}
            aria-current={current ? "page" : undefined}
            className={
              current
                ? "inline-flex min-w-9 items-center justify-center rounded-md border border-primary bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                : "inline-flex min-w-9 items-center justify-center rounded-md border border-border bg-card px-3 py-1.5 text-sm text-card-foreground shadow-xs hover:bg-muted"
            }
          >
            {number}
          </Link>
        );
      })}
    </nav>
  );
}

function copyrightYear(): string {
  return new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Belgrade",
    year: "numeric",
  }).format(new Date());
}

function parseCoords(latRaw?: string, lngRaw?: string): { lat: number; lng: number } | null {
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

async function resolveStaffEntryUrl(): Promise<string> {
  const store = await headers();
  const host = store.get("x-forwarded-host") ?? store.get("host");
  const proto =
    store.get("x-forwarded-proto") ??
    (host?.startsWith("localhost") || host?.startsWith("127.0.0.1") ? "http" : "https");

  return staffEntryHref({
    staffUrl: process.env.STAFF_URL,
    appUrl: process.env.APP_URL,
    requestOrigin: host ? `${proto}://${host}` : null,
  });
}
