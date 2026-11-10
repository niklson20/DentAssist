"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatRatingAverage,
  formatRatingCount,
  type RatingSummary,
} from "@/lib/ratings";

import { PublicSiteFooter, publicSiteFooterClearance } from "../public-site-footer";
import { PublicSiteNav } from "../public-site-nav";
import { RatingBadge } from "../rating-badge";
import { splitClinicDescription } from "./clinic-description";
import { getClinicHoursStatus, type ClinicHoursStatus } from "./clinic-hours-status";
import { PatientSignOutButton } from "./sign-out-button";
import { ClinicSlotsPanel } from "./clinic-slots-panel";
import type { ClinicHoursRange } from "./load-clinic-public";
import {
  dentistStorageKey,
  formatDentistLabel,
  persistDentistPreference,
  pickInitialDentistId,
  type PublicDentist,
} from "./dentist-preference";

type ClinicProfileViewProps = {
  slug: string;
  name: string;
  city: string;
  address: string;
  phone: string;
  description: string;
  logoUrl: string | null;
  rating?: RatingSummary | null;
  weekdayHours: ClinicHoursRange | null;
  weekendHours: ClinicHoursRange | null;
  weekdayHasSchedule: boolean;
  weekendHasSchedule: boolean;
  dentists: PublicDentist[];
  initialDentistId: string | null;
  currentTimeIso: string;
  showPatientAuth: boolean;
  showSlotsHint: boolean;
  bookingDays: string[];
  todayIso: string;
  initialSlots: string[];
  staffEntryUrl: string;
};

export function ClinicProfileView({
  slug,
  name,
  city,
  address,
  phone,
  description,
  logoUrl,
  rating = null,
  weekdayHours,
  weekendHours,
  weekdayHasSchedule,
  weekendHasSchedule,
  dentists,
  initialDentistId,
  currentTimeIso,
  showPatientAuth,
  showSlotsHint,
  bookingDays,
  todayIso,
  initialSlots,
  staffEntryUrl,
}: ClinicProfileViewProps) {
  const location = [address, city].filter(Boolean).join(", ");
  const [currentTime, setCurrentTime] = useState(() => new Date(currentTimeIso));
  const [selectedDentistId, setSelectedDentistId] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(dentistStorageKey(slug));
      return pickInitialDentistId(dentists, stored ?? initialDentistId) ?? null;
    }
    return pickInitialDentistId(dentists, initialDentistId) ?? null;
  });

  useEffect(() => {
    const updateCurrentTime = () => setCurrentTime(new Date());
    updateCurrentTime();
    const intervalId = window.setInterval(updateCurrentTime, 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  function selectDentist(dentistId: string) {
    setSelectedDentistId(dentistId);
    persistDentistPreference(slug, dentistId);
  }

  return (
    <div className="relative flex min-h-svh flex-col bg-background text-foreground">
      <PublicSiteNav>
        {showPatientAuth ? (
          <nav aria-label="Nalog pacijenta" className="flex items-center gap-1">
            <Link
              href={`/ordinacije/${slug}/prijava`}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Prijava
            </Link>
            <Link
              href={`/ordinacije/${slug}/registracija`}
              className={buttonVariants({ size: "sm" })}
            >
              Registracija
            </Link>
          </nav>
        ) : (
          <nav aria-label="Nalog pacijenta" className="flex items-center gap-1">
            <Link
              href="/nalog/profil"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Profil
            </Link>
            <PatientSignOutButton slug={slug} />
          </nav>
        )}
      </PublicSiteNav>
      <header className="px-4 pt-6 sm:pt-9">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 rounded-2xl border border-border bg-gradient-to-br from-card via-card to-primary/5 p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between sm:gap-7 sm:p-6">
          <div className="flex min-w-0 items-start gap-3 sm:gap-4">
            <div className="flex size-[60px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-background sm:size-[76px]">
              {logoUrl ? (
                <Image
                  src={logoUrl}
                  alt=""
                  width={76}
                  height={76}
                  className="size-full object-contain p-1.5"
                  unoptimized
                />
              ) : (
                <span className="text-lg font-semibold tracking-wide text-primary">
                  {clinicInitials(name)}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">Stomatološka ordinacija</p>
              <div className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-5">
                {location ? (
                  <span className="inline-flex items-start gap-1.5">
                    <MapPinIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>{location}</span>
                  </span>
                ) : null}
                {phone ? (
                  <span className="inline-flex items-center gap-1.5">
                    <PhoneIcon className="size-4 shrink-0 text-primary" />
                    <a
                      className="underline-offset-4 hover:text-primary hover:underline"
                      href={`tel:${phone.replace(/[^\d+]/g, "")}`}
                    >
                      {phone}
                    </a>
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-center sm:gap-4">
            {rating ? <RatingBadge rating={rating} compact /> : null}
            <a
              href="#clinic-booking"
              className={cn(buttonVariants(), "min-h-11 flex-1 gap-2 sm:flex-none")}
            >
              Izaberi termin
              <ArrowRightIcon className="size-4" />
            </a>
          </div>
        </div>
      </header>

      <main
        className={`mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-6 sm:py-8 ${publicSiteFooterClearance}`}
      >
        <div className="flex flex-col gap-4">
          <section
            aria-labelledby="clinic-hours-heading"
            className="w-full max-w-[380px] rounded-xl border border-border bg-card p-5 text-card-foreground shadow-xs"
          >
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-border/70 pb-3">
              <h2 id="clinic-hours-heading" className="flex items-center gap-2 text-base font-semibold">
                <ClockIcon className="size-5 text-primary" />
                Radno vreme
              </h2>
              <HoursStatusBadge
                status={getClinicHoursStatus({
                  now: currentTime,
                  weekdayHours,
                  weekendHours,
                  weekdayHasSchedule,
                  weekendHasSchedule,
                })}
              />
            </div>
            <dl className="flex flex-col gap-2.5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Pon – Pet</dt>
                <dd
                  className={cn(
                    "font-medium tabular-nums",
                    !weekdayHours && weekdayHasSchedule && "font-normal text-muted-foreground",
                  )}
                >
                  {formatHoursRange(weekdayHours, weekdayHasSchedule)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Sub – Ned</dt>
                <dd
                  className={cn(
                    "font-medium tabular-nums",
                    !weekendHours && weekendHasSchedule && "font-normal text-muted-foreground",
                  )}
                >
                  {formatHoursRange(weekendHours, weekendHasSchedule)}
                </dd>
              </div>
            </dl>
          </section>

          {description ? (
            <section
              aria-labelledby="clinic-description-heading"
              className="space-y-3 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-xs"
            >
              <h2 id="clinic-description-heading" className="text-base font-semibold">
                O ordinaciji
              </h2>
              <div className="max-w-prose space-y-3 text-sm leading-7 text-muted-foreground">
                {splitClinicDescription(description).map((paragraph, index) => (
                  <p key={`${index}-${paragraph}`}>{paragraph}</p>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <section id="clinic-booking" aria-labelledby="clinic-booking-heading" className="scroll-mt-6 space-y-5">
          <div>
            <h2 id="clinic-booking-heading" className="text-xl font-semibold tracking-tight">
              Zakazivanje
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Izaberite stomatologa i slobodan termin koji vam odgovara.
            </p>
          </div>

          {dentists.length > 0 ? (
            <section className="space-y-3">
              <h3 className="text-sm font-medium">Stomatolozi</h3>
              {showSlotsHint ? (
                <ul className="space-y-2 text-sm">
                  {dentists.map((dentist) => (
                    <li key={dentist.id} className="flex items-center gap-2">
                      <span>{formatDentistLabel(dentist)}</span>
                      {dentist.rating ? <RatingLabel rating={dentist.rating} /> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {dentists.map((dentist) => {
                    const active = dentist.id === selectedDentistId;
                    return (
                      <Button
                        key={dentist.id}
                        type="button"
                        variant={active ? "default" : "outline"}
                        size="sm"
                        className={cn(!active && "bg-background")}
                        aria-pressed={active}
                        onClick={() => selectDentist(dentist.id)}
                      >
                        <span>{formatDentistLabel(dentist)}</span>
                        {dentist.rating ? (
                          <RatingLabel rating={dentist.rating} selected={active} />
                        ) : null}
                      </Button>
                    );
                  })}
                </div>
              )}
            </section>
          ) : null}

          {showSlotsHint ? (
            <p className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              <Link
                href={`/ordinacije/${encodeURIComponent(slug)}/prijava`}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Prijavite se
              </Link>{" "}
              da vidite slobodne termine.
            </p>
          ) : null}

          {!showSlotsHint && selectedDentistId ? (
            <ClinicSlotsPanel
              key={selectedDentistId}
              slug={slug}
              dentistId={selectedDentistId}
              todayIso={todayIso}
              bookingDays={bookingDays}
              initialDay={todayIso}
              initialSlots={initialSlots}
            />
          ) : null}
        </section>
      </main>
      <PublicSiteFooter staffEntryUrl={staffEntryUrl} />
    </div>
  );
}

function HoursStatusBadge({ status }: { status: ClinicHoursStatus }) {
  const styles = {
    open: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    closed: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
    unknown: "bg-muted text-muted-foreground",
  } satisfies Record<ClinicHoursStatus, string>;
  const labels = {
    open: "Otvoreno",
    closed: "Zatvoreno",
    unknown: "Nije navedeno",
  } satisfies Record<ClinicHoursStatus, string>;

  return (
    <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", styles[status])}>
      {labels[status]}
    </span>
  );
}

function clinicInitials(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase("sr-RS");
  return initials || "O";
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

function ClockIcon({ className }: { className: string }) {
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
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
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

function RatingLabel({
  rating,
  selected = false,
}: {
  rating: RatingSummary;
  selected?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full text-xs",
        selected
          ? "bg-white/15 px-1.5 py-0.5 font-medium text-primary-foreground"
          : "text-muted-foreground",
      )}
      aria-label={`Prosečna ocena ${formatRatingAverage(rating.average)} od 5, ${formatRatingCount(rating.count)}`}
    >
      <span aria-hidden="true" className={selected ? "text-amber-300" : "text-amber-600"}>
        ★
      </span>
      <span>{formatRatingAverage(rating.average)}/5 · {formatRatingCount(rating.count)}</span>
    </span>
  );
}

function formatHoursRange(hours: ClinicHoursRange | null, hasSchedule: boolean): string {
  if (!hours) {
    return hasSchedule ? "Zatvoreno" : "Nije navedeno";
  }
  return `${hours.opensAt.slice(0, 5)} – ${hours.closesAt.slice(0, 5)}`;
}
