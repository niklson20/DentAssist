"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

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
  showPatientAuth,
  showSlotsHint,
  bookingDays,
  todayIso,
  initialSlots,
  staffEntryUrl,
}: ClinicProfileViewProps) {
  const location = [address, city].filter(Boolean).join(", ");
  const [selectedDentistId, setSelectedDentistId] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(dentistStorageKey(slug));
      return pickInitialDentistId(dentists, stored ?? initialDentistId) ?? null;
    }
    return pickInitialDentistId(dentists, initialDentistId) ?? null;
  });

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
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt=""
                width={64}
                height={64}
                className="size-16 shrink-0 rounded-md border border-border object-contain bg-card"
                unoptimized
              />
            ) : null}
            <div className="min-w-0 space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
              {location ? <p className="text-sm text-muted-foreground">{location}</p> : null}
              {phone ? <p className="text-sm text-muted-foreground">{phone}</p> : null}
            </div>
          </div>
          {rating ? <RatingBadge rating={rating} /> : null}
        </div>
      </header>

      <main
        className={`mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 pt-8 ${publicSiteFooterClearance}`}
      >
        <section
          aria-labelledby="clinic-hours-heading"
          className="w-fit space-y-3 text-card-foreground"
        >
          <h2 id="clinic-hours-heading" className="text-base font-semibold">
            Radno vrijeme
          </h2>
          <dl className="grid gap-2 text-sm">
            <div className="flex items-center gap-1">
              <dt className="text-muted-foreground">Radnim danima:</dt>
              <dd className="font-medium">
                {formatHoursRange(weekdayHours, weekdayHasSchedule)}
              </dd>
            </div>
            <div className="flex items-center gap-1">
              <dt className="text-muted-foreground">Vikendom:</dt>
              <dd className="font-medium">
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

        {dentists.length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-sm font-medium">Stomatolozi</h2>
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
                      {dentist.rating ? <RatingLabel rating={dentist.rating} /> : null}
                    </Button>
                  );
                })}
              </div>
            )}
          </section>
        ) : null}

        {showSlotsHint ? (
          <p className="flex flex-1 items-center justify-center text-center text-base font-medium text-foreground">
            Prijavite se da vidite slobodne termine
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
      </main>
      <PublicSiteFooter staffEntryUrl={staffEntryUrl} />
    </div>
  );
}

function RatingLabel({ rating }: { rating: RatingSummary }) {
  return (
    <span
      className="text-xs text-muted-foreground"
      aria-label={`Prosečna ocena ${formatRatingAverage(rating.average)} od 5, ${formatRatingCount(rating.count)}`}
    >
      ★ {formatRatingAverage(rating.average)}/5 · {formatRatingCount(rating.count)}
    </span>
  );
}

function formatHoursRange(hours: ClinicHoursRange | null, hasSchedule: boolean): string {
  if (!hours) {
    return hasSchedule ? "Zatvoreno" : "Nije navedeno";
  }
  return `${hours.opensAt.slice(0, 5)}–${hours.closesAt.slice(0, 5)}`;
}
