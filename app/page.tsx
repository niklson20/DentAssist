import type { Metadata } from "next";
import Image from "next/image";
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
import { PublicSiteFooter, publicSiteFooterClearance } from "@/app/ordinacije/public-site-footer";
import { PublicSiteNav } from "@/app/ordinacije/public-site-nav";
import { RatingBadge } from "@/app/ordinacije/rating-badge";
import { PatientSignOutButton } from "@/app/ordinacije/[slug]/sign-out-button";
import { resolveStaffEntryUrl } from "@/app/ordinacije/staff-entry-url";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSessionKind } from "@/lib/auth";
import {
  listDirectoryCities,
  searchDirectoryClinics,
} from "@/lib/queries/public";
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
  const sessionKind = await getSessionKind();
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
    <div className="relative flex min-h-svh flex-col bg-background text-foreground">
      <PublicSiteNav>
        {sessionKind === "patient" ? (
          <nav aria-label="Nalog pacijenta" className="flex items-center gap-1">
            <Link
              href="/nalog/profil"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Profil
            </Link>
            <PatientSignOutButton />
          </nav>
        ) : (
          <nav aria-label="Nalog pacijenta" className="flex items-center gap-1">
            <Link
              href="/nalog/prijava"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Prijava
            </Link>
            <Link href="/nalog/registracija" className={buttonVariants({ size: "sm" })}>
              Registracija
            </Link>
          </nav>
        )}
      </PublicSiteNav>
      <main
        className={`mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 pt-8 ${publicSiteFooterClearance}`}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <section className="w-full space-y-3 sm:order-2 sm:w-[300px] sm:shrink-0">
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
          <section className="space-y-3 sm:order-1 sm:pt-0">
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
        </div>

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
                            className="group block rounded-xl border border-border/80 bg-card p-4 text-card-foreground shadow-xs transition-[border-color,background-color,box-shadow] hover:border-primary/30 hover:bg-muted/30 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          >
                            <div className="flex items-start gap-4">
                              <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40">
                                {clinic.logoUrl ? (
                                  <Image
                                    src={clinic.logoUrl}
                                    alt=""
                                    width={64}
                                    height={64}
                                    className="size-full object-contain p-1"
                                    unoptimized
                                  />
                                ) : (
                                  <span className="text-sm font-semibold tracking-wide text-primary">
                                    {clinic.name
                                      .trim()
                                      .split(/\s+/)
                                      .filter(Boolean)
                                      .slice(0, 2)
                                      .map((part) => part[0])
                                      .join("")
                                      .toLocaleUpperCase("sr-RS") || "O"}
                                  </span>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                                  <div className="min-w-0">
                                    <p className="font-semibold leading-5 transition-colors group-hover:text-primary">
                                      {clinic.name}
                                    </p>
                                    <p className="mt-1 flex items-start gap-1.5 text-sm leading-5 text-muted-foreground">
                                      <MapPinIcon className="mt-0.5 size-4 shrink-0" />
                                      <span>
                                        {formatDirectoryAddress(clinic.address, clinic.city)}
                                      </span>
                                    </p>
                                  </div>
                                  {clinic.rating ? (
                                    <RatingBadge rating={clinic.rating} compact />
                                  ) : null}
                                </div>
                                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                                  {clinic.phone ? (
                                    <span className="inline-flex items-center gap-1.5">
                                      <PhoneIcon className="size-4 shrink-0" />
                                      {clinic.phone}
                                    </span>
                                  ) : null}
                                  {distanceLabel ? (
                                    <span className="inline-flex items-center gap-1.5">
                                      <MapPinIcon className="size-4 shrink-0" />
                                      Udaljenost: {distanceLabel}
                                    </span>
                                  ) : null}
                                  <span className="ml-auto inline-flex items-center gap-1 font-medium text-primary transition-transform group-hover:translate-x-0.5">
                                    Pogledaj
                                    <ArrowRightIcon className="size-4 shrink-0" />
                                  </span>
                                </div>
                              </div>
                            </div>
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

      <PublicSiteFooter staffEntryUrl={staffEntryUrl} />
    </div>
  );
}

function MapPinIcon({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.75"
      viewBox="0 0 24 24"
    >
      <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" />
      <circle cx="12" cy="10" r="2.25" />
    </svg>
  );
}

function PhoneIcon({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.75"
      viewBox="0 0 24 24"
    >
      <path d="M7.5 3.5h-3A1.5 1.5 0 0 0 3 5c0 8.84 7.16 16 16 16a1.5 1.5 0 0 0 1.5-1.5v-3l-5-2-2 2a12.5 12.5 0 0 1-6-6l2-2-2-5Z" />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.75"
      viewBox="0 0 24 24"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
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
