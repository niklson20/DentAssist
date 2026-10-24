"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { PublicSiteNav } from "../public-site-nav";
import { ClinicSlotsPanel } from "./clinic-slots-panel";
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
  address: string;
  phone: string;
  description: string;
  logoUrl: string | null;
  dentists: PublicDentist[];
  initialDentistId: string | null;
  showPatientAuth: boolean;
  showSlotsHint: boolean;
  bookingDays: string[];
  todayIso: string;
  defaultDurationMin: number;
  initialSlots: string[];
};

export function ClinicProfileView({
  slug,
  name,
  address,
  phone,
  description,
  logoUrl,
  dentists,
  initialDentistId,
  showPatientAuth,
  showSlotsHint,
  bookingDays,
  todayIso,
  defaultDurationMin,
  initialSlots,
}: ClinicProfileViewProps) {
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
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <PublicSiteNav />
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-3xl items-start justify-between gap-4 px-4 py-4">
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
              <p className="text-sm text-muted-foreground">{address}</p>
              {phone ? <p className="text-sm text-muted-foreground">{phone}</p> : null}
            </div>
          </div>
          {showPatientAuth ? (
            <nav className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <Link
                href={`/ordinacije/${slug}/prijava`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
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
          ) : null}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-8">
        {description ? (
          <p className="text-sm leading-relaxed text-foreground">{description}</p>
        ) : null}

        {dentists.length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-sm font-medium">Stomatolozi</h2>
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
                    {formatDentistLabel(dentist)}
                  </Button>
                );
              })}
            </div>
          </section>
        ) : null}

        {showSlotsHint ? (
          <p className="text-sm text-muted-foreground">Prijavite se da vidite slobodne termine</p>
        ) : null}

        {!showSlotsHint && selectedDentistId ? (
          <ClinicSlotsPanel
            key={selectedDentistId}
            slug={slug}
            dentistId={selectedDentistId}
            defaultDurationMin={defaultDurationMin}
            todayIso={todayIso}
            bookingDays={bookingDays}
            initialDay={todayIso}
            initialSlots={initialSlots}
          />
        ) : null}
      </main>
    </div>
  );
}
