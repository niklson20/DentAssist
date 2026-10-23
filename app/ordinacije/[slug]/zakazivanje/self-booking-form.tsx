"use client";

import { useActionState, useState } from "react";

import { submitSelfBooking } from "@/app/actions/booking";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";

import { bookingConsentText, CHILD_ROUTE_TEXT, isChildRoute } from "./schema";

type SelfBookingFields = {
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string;
  dateOfBirth: string | null;
};

type SelfBookingScreenProps = {
  slug: string;
  clinicName: string;
  stomatolog: string;
  pocetak: string;
  dentistLabel: string | null;
  slotLabel: string;
  today: string;
  selfLinked: boolean;
  profile: SelfBookingFields;
};

type BookingResult = ActionResult<{ ready: true }> | null;

export function SelfBookingScreen({
  slug,
  clinicName,
  stomatolog,
  pocetak,
  dentistLabel,
  slotLabel,
  today,
  selfLinked,
  profile,
}: SelfBookingScreenProps) {
  const [dateOfBirth, setDateOfBirth] = useState(profile.dateOfBirth ?? "");

  if (isChildRoute(dateOfBirth, today)) {
    return (
      <ChildRoute
        dateOfBirth={dateOfBirth}
        onDateOfBirth={setDateOfBirth}
        dentistLabel={dentistLabel}
        slotLabel={slotLabel}
        today={today}
      />
    );
  }

  if (selfLinked) {
    return (
      <LinkedRequest
        slug={slug}
        stomatolog={stomatolog}
        pocetak={pocetak}
        dentistLabel={dentistLabel}
        slotLabel={slotLabel}
      />
    );
  }

  return (
    <IdentityForm
      slug={slug}
      clinicName={clinicName}
      stomatolog={stomatolog}
      pocetak={pocetak}
      dentistLabel={dentistLabel}
      slotLabel={slotLabel}
      today={today}
      profile={profile}
      dateOfBirth={dateOfBirth}
      onDateOfBirth={setDateOfBirth}
    />
  );
}

function ChildRoute({
  dateOfBirth,
  onDateOfBirth,
  dentistLabel,
  slotLabel,
  today,
}: {
  dateOfBirth: string;
  onDateOfBirth: (value: string) => void;
  dentistLabel: string | null;
  slotLabel: string;
  today: string;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 text-card-foreground">
      <h2 className="text-lg font-semibold">Zakazivanje za dete</h2>
      <SlotSummary dentistLabel={dentistLabel} slotLabel={slotLabel} />
      <p className="text-sm">{CHILD_ROUTE_TEXT}</p>
      <DateField id="booking-child-birth" value={dateOfBirth} onChange={onDateOfBirth} today={today} />
    </section>
  );
}

function LinkedRequest({
  slug,
  stomatolog,
  pocetak,
  dentistLabel,
  slotLabel,
}: {
  slug: string;
  stomatolog: string;
  pocetak: string;
  dentistLabel: string | null;
  slotLabel: string;
}) {
  const [result, formAction, pending] = useActionState<BookingResult, FormData>(submitSelfBooking, null);
  const error = result && !result.ok ? result : null;

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 text-card-foreground" noValidate>
      <h2 className="text-lg font-semibold">Termin je za vas</h2>
      <SlotSummary dentistLabel={dentistLabel} slotLabel={slotLabel} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="stomatolog" value={stomatolog} />
      <input type="hidden" name="pocetak" value={pocetak} />
      <ReasonField error={error?.fieldErrors?.reason?.[0]} />
      {error && !error.fieldErrors ? <FormAlert message={error.error} /> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Slanje…" : "Pošalji zahtev"}
      </Button>
    </form>
  );
}

function IdentityForm({
  slug,
  clinicName,
  stomatolog,
  pocetak,
  dentistLabel,
  slotLabel,
  today,
  profile,
  dateOfBirth,
  onDateOfBirth,
}: {
  slug: string;
  clinicName: string;
  stomatolog: string;
  pocetak: string;
  dentistLabel: string | null;
  slotLabel: string;
  today: string;
  profile: SelfBookingFields;
  dateOfBirth: string;
  onDateOfBirth: (value: string) => void;
}) {
  const [result, formAction, pending] = useActionState<BookingResult, FormData>(submitSelfBooking, null);
  const error = result && !result.ok ? result : null;

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 text-card-foreground" noValidate>
      <h2 className="text-lg font-semibold">Za sebe</h2>
      <SlotSummary dentistLabel={dentistLabel} slotLabel={slotLabel} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="stomatolog" value={stomatolog} />
      <input type="hidden" name="pocetak" value={pocetak} />

      <Field
        id="booking-first-name"
        label="Ime"
        name="firstName"
        autoComplete="given-name"
        defaultValue={profile.firstName}
        error={error?.fieldErrors?.firstName?.[0]}
      />
      <Field
        id="booking-last-name"
        label="Prezime"
        name="lastName"
        autoComplete="family-name"
        defaultValue={profile.lastName}
        error={error?.fieldErrors?.lastName?.[0]}
      />
      <DateField
        id="booking-birth"
        value={dateOfBirth}
        onChange={onDateOfBirth}
        today={today}
        error={error?.fieldErrors?.dateOfBirth?.[0]}
      />
      <Field
        id="booking-phone"
        label="Telefon"
        name="phone"
        type="tel"
        autoComplete="tel"
        defaultValue={profile.phone ?? ""}
        error={error?.fieldErrors?.phone?.[0]}
      />
      <Field
        id="booking-email"
        label="Mejl"
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={profile.email}
        readOnly
        error={error?.fieldErrors?.email?.[0]}
      />
      <ReasonField error={error?.fieldErrors?.reason?.[0]} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="booking-consent" className="flex items-start gap-2 text-sm">
          <input
            id="booking-consent"
            type="checkbox"
            name="consent"
            value="yes"
            className="mt-0.5 size-4 rounded border-input accent-primary"
            aria-invalid={error?.fieldErrors?.consent?.[0] ? true : undefined}
            aria-describedby={error?.fieldErrors?.consent?.[0] ? "booking-consent-error" : undefined}
          />
          <span>{bookingConsentText(clinicName)}</span>
        </label>
        {error?.fieldErrors?.consent?.[0] ? (
          <p id="booking-consent-error" className="text-sm text-destructive">
            {error.fieldErrors.consent[0]}
          </p>
        ) : null}
      </div>

      {error && !error.fieldErrors ? <FormAlert message={error.error} /> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Slanje…" : "Pošalji zahtev"}
      </Button>
    </form>
  );
}

function SlotSummary({ dentistLabel, slotLabel }: { dentistLabel: string | null; slotLabel: string }) {
  return (
    <p className="text-sm text-muted-foreground">
      {dentistLabel ? `${dentistLabel}, ` : null}
      {slotLabel}
    </p>
  );
}

function ReasonField({ error }: { error?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="booking-reason" className="text-sm font-medium">
        Razlog dolaska <span className="font-normal text-muted-foreground">(nije obavezno)</span>
      </label>
      <textarea
        id="booking-reason"
        name="reason"
        rows={3}
        maxLength={300}
        className="w-full rounded-md border border-input bg-transparent px-2.5 py-2 text-sm text-foreground"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "booking-reason-error" : undefined}
      />
      {error ? (
        <p id="booking-reason-error" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function DateField({
  id,
  value,
  onChange,
  today,
  error,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  today: string;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        Datum rođenja
      </label>
      <Input
        id={id}
        name="dateOfBirth"
        type="date"
        autoComplete="bday"
        min="1900-01-01"
        max={today}
        value={value}
        onChange={(event) => onChange(event.target.value)}
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

function Field({
  id,
  label,
  name,
  error,
  type = "text",
  autoComplete,
  defaultValue,
  readOnly = false,
}: {
  id: string;
  label: string;
  name: string;
  error?: string;
  type?: string;
  autoComplete?: string;
  defaultValue?: string;
  readOnly?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        readOnly={readOnly}
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

function FormAlert({ message }: { message: string }) {
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}
