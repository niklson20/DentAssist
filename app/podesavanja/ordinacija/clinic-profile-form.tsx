"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import { saveClinicProfile } from "@/app/actions/settings";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";

import {
  bookingSummary,
  bufferHint,
  dayUnit,
  minuteUnit,
  nearestDuration,
  noticeReading,
  slotHint,
} from "./booking-copy";
import type { ClinicProfileView } from "./load-clinic";
import { DESCRIPTION_MAX_LENGTH, durationOptionsForSlot } from "./schema";

const choiceClass =
  "inline-flex h-9 cursor-pointer items-center justify-center rounded-md border border-input px-2.5 text-sm shadow-xs has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 dark:bg-input/30 dark:has-[:checked]:bg-primary";

const textareaClass =
  "min-h-24 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30";

export function ClinicProfileForm({
  clinic,
  publicPageUrl,
}: {
  clinic: ClinicProfileView;
  publicPageUrl: string;
}) {
  const [result, formAction, pending] = useActionState<ActionResult<{ saved: true }> | null, FormData>(
    saveClinicProfile,
    null,
  );
  const [slotMinutes, setSlotMinutes] = useState<15 | 30>(clinic.slotMinutes);
  const [bufferMinutes, setBufferMinutes] = useState<0 | 5 | 10 | 15>(clinic.bufferMinutes);
  const [defaultDurationMin, setDefaultDurationMin] = useState(() =>
    nearestDuration(clinic.defaultDurationMin, clinic.slotMinutes),
  );
  const [minNoticeMinutes, setMinNoticeMinutes] = useState(String(clinic.minNoticeMinutes));
  const [maxAheadDays, setMaxAheadDays] = useState(String(clinic.maxAheadDays));
  const [description, setDescription] = useState(clinic.description);
  const [logoName, setLogoName] = useState("");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [onlineBookingEnabled, setOnlineBookingEnabled] = useState(clinic.onlineBookingEnabled);
  const copyTimer = useRef<number | null>(null);
  const shownLogo = logoPreview ?? clinic.logoUrl;
  const durationOptions = useMemo(() => durationOptionsForSlot(slotMinutes), [slotMinutes]);

  useEffect(() => {
    return () => {
      if (logoPreview) {
        URL.revokeObjectURL(logoPreview);
      }
      if (copyTimer.current) {
        window.clearTimeout(copyTimer.current);
      }
    };
  }, [logoPreview]);

  async function copyPublicLink() {
    try {
      await navigator.clipboard.writeText(publicPageUrl);
      setCopied(true);
      if (copyTimer.current) {
        window.clearTimeout(copyTimer.current);
      }
      copyTimer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  const noticeMinutes = wholeNumber(minNoticeMinutes);
  const aheadDays = wholeNumber(maxAheadDays);
  const error = result && !result.ok ? result : null;

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      {result?.ok ? (
        <p className="text-sm" role="status">
          Podešavanja ordinacije su sačuvana.
        </p>
      ) : null}

      <Section title="Osnovno">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Naziv" name="name" defaultValue={clinic.name} error={error?.fieldErrors?.name?.[0]} />
          <Field label="Grad" name="city" defaultValue={clinic.city} error={error?.fieldErrors?.city?.[0]} />
          <Field
            label="Adresa"
            name="address"
            defaultValue={clinic.address}
            error={error?.fieldErrors?.address?.[0]}
          />
          <Field label="Telefon" name="phone" defaultValue={clinic.phone} error={error?.fieldErrors?.phone?.[0]} />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="description" className="text-sm font-medium">
              Kratak tekst
            </label>
            <span className="text-sm text-muted-foreground">
              {description.length}/{DESCRIPTION_MAX_LENGTH}
            </span>
          </div>
          <textarea
            id="description"
            name="description"
            value={description}
            maxLength={DESCRIPTION_MAX_LENGTH}
            onChange={(event) => setDescription(event.target.value.slice(0, DESCRIPTION_MAX_LENGTH))}
            className={textareaClass}
            aria-invalid={error?.fieldErrors?.description ? true : undefined}
          />
          {error?.fieldErrors?.description?.[0] ? (
            <p className="text-sm text-destructive">{error.fieldErrors.description[0]}</p>
          ) : null}
        </div>
      </Section>

      <Section title="Logo i javni link">
        <div className="flex items-center gap-4">
          {shownLogo ? (
            <img
              src={shownLogo}
              alt=""
              className="size-16 shrink-0 rounded-md border border-border object-cover"
            />
          ) : (
            <div className="size-16 shrink-0 rounded-md border border-dashed border-border" aria-hidden="true" />
          )}
          <div className="flex min-w-0 flex-col items-start gap-2">
            <div>
              <p className="text-sm font-medium">Logo</p>
              <p className="text-sm text-muted-foreground">JPEG, PNG ili WebP, do 1 MB.</p>
            </div>
            <label htmlFor="logo" className={`${buttonVariants({ variant: "outline", size: "sm" })} cursor-pointer`}>
              {shownLogo ? "Promeni logo" : "Izaberi logo"}
            </label>
            <input
              id="logo"
              name="logo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              aria-invalid={error?.fieldErrors?.logo ? true : undefined}
              onChange={(event) => {
                const file = event.target.files?.[0];
                setLogoName(file?.name ?? "");
                setLogoPreview(file ? URL.createObjectURL(file) : null);
              }}
            />
            {logoName ? <p className="max-w-full truncate text-sm text-muted-foreground">{logoName}</p> : null}
            {error?.fieldErrors?.logo?.[0] ? (
              <p className="text-sm text-destructive">{error.fieldErrors.logo[0]}</p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Javni link</span>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <p className="min-w-0 flex-1 break-all rounded-md border border-border px-2.5 py-2 text-sm">
              {publicPageUrl}
            </p>
            <div className="flex shrink-0 gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void copyPublicLink()}>
                {copied ? "Kopirano" : "Kopiraj"}
              </Button>
              <a
                href={publicPageUrl}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Otvori
              </a>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              name="onlineBookingEnabled"
              value="true"
              checked={onlineBookingEnabled}
              onChange={(event) => setOnlineBookingEnabled(event.target.checked)}
              className="size-4 rounded border-input accent-primary"
            />
            Online zakazivanje uključeno
          </label>
          <p className="text-sm text-muted-foreground">
            {onlineBookingEnabled
              ? "Pacijent može da zakaže termin preko javnog linka."
              : "Stranica ostaje javna, bez zakazivanja."}
          </p>
        </div>
      </Section>

      <Section title="Zakazivanje">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <h3 className="text-sm font-semibold">Kako se slažu termini</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <ChoiceGroup
                legend="Korak"
                name="slotMinutes"
                value={slotMinutes}
                hint={slotHint(slotMinutes)}
                error={error?.fieldErrors?.slotMinutes?.[0]}
                onChange={(value) => {
                  setSlotMinutes(value);
                  setDefaultDurationMin((current) => nearestDuration(current, value));
                }}
                options={[
                  { value: 15, label: "15 min" },
                  { value: 30, label: "30 min" },
                ]}
              />
              <ChoiceGroup
                legend="Razmak"
                name="bufferMinutes"
                value={bufferMinutes}
                hint={bufferHint(bufferMinutes)}
                error={error?.fieldErrors?.bufferMinutes?.[0]}
                onChange={setBufferMinutes}
                options={[
                  { value: 0, label: "Nema" },
                  { value: 5, label: "5", accessibleName: "5 minuta" },
                  { value: 10, label: "10", accessibleName: "10 minuta" },
                  { value: 15, label: "15", accessibleName: "15 minuta" },
                ]}
              />
            </div>
            <ChoiceGroup
              legend="Trajanje novog termina"
              name="defaultDurationMin"
              value={defaultDurationMin}
              error={error?.fieldErrors?.defaultDurationMin?.[0]}
              onChange={setDefaultDurationMin}
              options={durationOptions.map((minutes) => ({
                value: minutes,
                label: String(minutes),
                accessibleName: `${minutes} minuta`,
              }))}
            />
          </div>

          <div className="flex flex-col gap-4">
            <h3 className="text-sm font-semibold">Kad pacijent sme da zakaže</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <QuantityField
                label="Najranije"
                name="minNoticeMinutes"
                value={minNoticeMinutes}
                onChange={setMinNoticeMinutes}
                unit={noticeMinutes === null ? "minuta" : minuteUnit(noticeMinutes)}
                reading={noticeMinutes === null ? undefined : noticeReading(noticeMinutes)}
                error={error?.fieldErrors?.minNoticeMinutes?.[0]}
              />
              <QuantityField
                label="Najdalje"
                name="maxAheadDays"
                value={maxAheadDays}
                onChange={setMaxAheadDays}
                unit={aheadDays === null ? "dana" : dayUnit(aheadDays)}
                error={error?.fieldErrors?.maxAheadDays?.[0]}
              />
            </div>
          </div>

          {noticeMinutes !== null && aheadDays !== null ? (
            <p className="text-sm text-muted-foreground">
              {bookingSummary(defaultDurationMin, noticeMinutes, aheadDays)}
            </p>
          ) : null}
        </div>
      </Section>

      {error && !hasFieldErrors(error.fieldErrors) ? (
        <p role="alert" className="text-sm text-destructive">
          {error.error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Čuvanje u toku…" : "Sačuvaj"}
      </Button>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4 text-card-foreground">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  name,
  defaultValue,
  error,
  type = "text",
  min,
  step,
}: {
  label: string;
  name: string;
  defaultValue: string;
  error?: string;
  type?: string;
  min?: number;
  step?: number;
}) {
  const id = name;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={id}
        name={name}
        type={type}
        defaultValue={defaultValue}
        min={min}
        step={step}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ChoiceGroup<T extends number>({
  legend,
  name,
  value,
  onChange,
  options,
  hint,
  error,
}: {
  legend: string;
  name: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; accessibleName?: string }[];
  hint?: string;
  error?: string;
}) {
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = error ? `${name}-error` : undefined;
  return (
    <fieldset
      className="flex min-w-0 flex-col gap-1.5"
      aria-invalid={error ? true : undefined}
      aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
    >
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label key={option.value} className={choiceClass}>
            <input
              type="radio"
              className="sr-only"
              name={name}
              value={option.value}
              checked={value === option.value}
              aria-label={option.accessibleName}
              onChange={() => onChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
      {hint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

function QuantityField({
  label,
  name,
  value,
  onChange,
  unit,
  reading,
  error,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  unit: string;
  reading?: string;
  error?: string;
}) {
  const readingId = reading ? `${name}-reading` : undefined;
  const errorId = error ? `${name}-error` : undefined;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <div className="w-28">
          <Input
            id={name}
            name={name}
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={value}
            aria-invalid={error ? true : undefined}
            aria-describedby={[readingId, errorId].filter(Boolean).join(" ") || undefined}
            onChange={(event) => {
              const next = event.target.value;
              if (next === "" || /^\d+$/.test(next)) {
                onChange(next);
              }
            }}
          />
        </div>
        <span className="text-sm text-muted-foreground">{unit}</span>
      </div>
      {reading ? (
        <p id={readingId} className="text-sm text-muted-foreground">
          {reading}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function wholeNumber(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }
  return Number(value);
}

function hasFieldErrors(fieldErrors?: Record<string, string[]>): boolean {
  return Boolean(fieldErrors && Object.keys(fieldErrors).length > 0);
}
