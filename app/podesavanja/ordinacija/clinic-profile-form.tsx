"use client";

import { useActionState, useMemo, useState } from "react";

import { saveClinicProfile } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";

import type { ClinicProfileView } from "./load-clinic";
import { durationOptionsForSlot } from "./schema";

const fieldClass =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30";

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
  const [slotMinutes, setSlotMinutes] = useState(clinic.slotMinutes);
  const durationOptions = useMemo(() => durationOptionsForSlot(slotMinutes), [slotMinutes]);
  const error = result && !result.ok ? result : null;

  return (
    <form action={formAction} className="flex flex-col gap-6" encType="multipart/form-data" noValidate>
      {result?.ok ? (
        <p className="text-sm" role="status">
          Podešavanja ordinacije su sačuvana.
        </p>
      ) : null}

      <Section title="Osnovno">
        <Field label="Naziv" name="name" defaultValue={clinic.name} error={error?.fieldErrors?.name?.[0]} />
        <Field label="Grad" name="city" defaultValue={clinic.city} error={error?.fieldErrors?.city?.[0]} />
        <Field
          label="Adresa"
          name="address"
          defaultValue={clinic.address}
          error={error?.fieldErrors?.address?.[0]}
        />
        <Field label="Telefon" name="phone" defaultValue={clinic.phone} error={error?.fieldErrors?.phone?.[0]} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="description" className="text-sm font-medium">
            Kratak tekst
          </label>
          <textarea
            id="description"
            name="description"
            defaultValue={clinic.description}
            maxLength={500}
            className={textareaClass}
            aria-invalid={error?.fieldErrors?.description ? true : undefined}
          />
          {error?.fieldErrors?.description?.[0] ? (
            <p className="text-sm text-destructive">{error.fieldErrors.description[0]}</p>
          ) : null}
        </div>
      </Section>

      <Section title="Logo i javni link">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="logo" className="text-sm font-medium">
            Logo
          </label>
          {clinic.logoUrl ? (
            <img
              src={clinic.logoUrl}
              alt=""
              className="h-16 w-16 rounded-md border border-border object-cover"
            />
          ) : (
            <p className="text-sm text-muted-foreground">Logo nije unet.</p>
          )}
          <Input
            id="logo"
            name="logo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-invalid={error?.fieldErrors?.logo ? true : undefined}
          />
          <p className="text-sm text-muted-foreground">JPEG, PNG ili WebP, do 1 MB.</p>
          {error?.fieldErrors?.logo?.[0] ? (
            <p className="text-sm text-destructive">{error.fieldErrors.logo[0]}</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Javni link</span>
          <p className="break-all text-sm text-muted-foreground">{publicPageUrl}</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="onlineBookingEnabled"
            value="true"
            defaultChecked={clinic.onlineBookingEnabled}
            className="size-4 rounded border-input accent-primary"
          />
          Online zakazivanje uključeno
        </label>
      </Section>

      <Section title="Zakazivanje">
        <SelectField
          label="Korak termina"
          name="slotMinutes"
          controlledValue={slotMinutes}
          onChange={(event) => setSlotMinutes(Number(event.target.value) as 15 | 30)}
          error={error?.fieldErrors?.slotMinutes?.[0]}
          options={[
            { value: 15, label: "15 minuta" },
            { value: 30, label: "30 minuta" },
          ]}
        />
        <SelectField
          label="Razmak između termina"
          name="bufferMinutes"
          defaultValue={clinic.bufferMinutes}
          error={error?.fieldErrors?.bufferMinutes?.[0]}
          options={[
            { value: 0, label: "0 minuta" },
            { value: 5, label: "5 minuta" },
            { value: 10, label: "10 minuta" },
            { value: 15, label: "15 minuta" },
          ]}
        />
        <SelectField
          label="Podrazumevano trajanje"
          name="defaultDurationMin"
          defaultValue={clinic.defaultDurationMin}
          error={error?.fieldErrors?.defaultDurationMin?.[0]}
          options={durationOptions.map((minutes) => ({
            value: minutes,
            label: `${minutes} minuta`,
          }))}
        />
        <Field
          label="Najava (minute pre termina)"
          name="minNoticeMinutes"
          type="number"
          min={0}
          step={1}
          defaultValue={String(clinic.minNoticeMinutes)}
          error={error?.fieldErrors?.minNoticeMinutes?.[0]}
        />
        <Field
          label="Horizont (dana unapred)"
          name="maxAheadDays"
          type="number"
          min={0}
          step={1}
          defaultValue={String(clinic.maxAheadDays)}
          error={error?.fieldErrors?.maxAheadDays?.[0]}
        />
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
    <div className="flex flex-col gap-1.5">
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

function SelectField({
  label,
  name,
  defaultValue,
  controlledValue,
  onChange,
  error,
  options,
}: {
  label: string;
  name: string;
  defaultValue?: number;
  controlledValue?: number;
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  error?: string;
  options: { value: number; label: string }[];
}) {
  const id = name;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        name={name}
        className={fieldClass}
        defaultValue={controlledValue === undefined ? defaultValue : undefined}
        value={controlledValue}
        onChange={onChange}
        aria-invalid={error ? true : undefined}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

function hasFieldErrors(fieldErrors?: Record<string, string[]>): boolean {
  return Boolean(fieldErrors && Object.keys(fieldErrors).length > 0);
}
