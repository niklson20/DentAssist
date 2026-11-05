"use client";

import Link from "next/link";
import { useActionState, useState, type ReactNode } from "react";

import { submitChildBooking, submitSelfBooking } from "@/app/actions/booking";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";
import { bookingRequestStatusLabel, relationshipLabel } from "@/lib/labels";

import {
  bookingConsentText,
  CHILD_ROUTE_TEXT,
  freeStartsHref,
  GUARDIAN_STATEMENT,
  isChildRoute,
  NOT_PROCEDURE_CONSENT,
  REQUEST_RECEIVED,
  SLOT_TAKEN,
  type BookingChild,
} from "./schema";

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
  accountChildren?: BookingChild[];
  initialDependentId?: string;
};

type BookingResult = ActionResult<{ status: "pending" }> | null;

export function bookingFollowUp(result: BookingResult, slug: string) {
  if (result?.ok) {
    return <RequestReceived />;
  }
  if (result && !result.ok && result.error === SLOT_TAKEN) {
    return <SlotTaken slug={slug} />;
  }
  return null;
}

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
  accountChildren = [],
  initialDependentId,
}: SelfBookingScreenProps) {
  const minorAccount = isChildRoute(profile.dateOfBirth, today);
  const requested = bookableChild(accountChildren, today, initialDependentId);
  const [who, setWho] = useState<"self" | "child">(minorAccount || requested ? "child" : "self");
  const [ageSwitch, setAgeSwitch] = useState(minorAccount);
  const [selfDob, setSelfDob] = useState(profile.dateOfBirth ?? "");
  const [childDob, setChildDob] = useState(minorAccount ? (profile.dateOfBirth ?? "") : "");

  function onSelfDob(value: string) {
    setSelfDob(value);
    if (isChildRoute(value, today)) {
      setChildDob(value);
      setAgeSwitch(true);
      setWho("child");
    }
  }

  const showChoice = !minorAccount && !ageSwitch;
  const choice = showChoice ? (
    <WhoChoice
      who={who}
      onSelf={() => {
        setAgeSwitch(false);
        setWho("self");
      }}
      onChild={() => {
        setAgeSwitch(false);
        setWho("child");
      }}
    />
  ) : null;

  if (who === "child") {
    return (
      <BookingWithChoice choice={choice}>
        <ChildBookingForm
          slug={slug}
          clinicName={clinicName}
          stomatolog={stomatolog}
          pocetak={pocetak}
          dentistLabel={dentistLabel}
          slotLabel={slotLabel}
          today={today}
          profile={profile}
          accountChildren={accountChildren}
          initialDependentId={requested?.id}
          childDateOfBirth={childDob}
          onChildDateOfBirth={(value) => {
            setChildDob(value);
            if (ageSwitch && !isChildRoute(value, today)) {
              setSelfDob(value);
              setAgeSwitch(false);
              setWho("self");
            }
          }}
          notice={ageSwitch ? CHILD_ROUTE_TEXT : null}
        />
      </BookingWithChoice>
    );
  }

  return (
    <BookingWithChoice choice={choice}>
      {selfLinked ? (
        <LinkedRequest
          slug={slug}
          stomatolog={stomatolog}
          pocetak={pocetak}
          dentistLabel={dentistLabel}
          slotLabel={slotLabel}
        />
      ) : (
        <IdentityForm
          slug={slug}
          clinicName={clinicName}
          stomatolog={stomatolog}
          pocetak={pocetak}
          dentistLabel={dentistLabel}
          slotLabel={slotLabel}
          today={today}
          profile={profile}
          dateOfBirth={selfDob}
          onDateOfBirth={onSelfDob}
        />
      )}
    </BookingWithChoice>
  );
}

function BookingWithChoice({ choice, children }: { choice: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 min-[1000px]:w-max min-[1000px]:shrink-0 min-[1000px]:flex-row min-[1000px]:items-start min-[1000px]:self-start">
      {choice ? <div className="min-[1000px]:order-2 min-[1000px]:shrink-0">{choice}</div> : null}
      <div className="w-full min-w-0 min-[1000px]:order-1 min-[1000px]:w-[480px] min-[1000px]:shrink-0">{children}</div>
    </div>
  );
}

export function ChildBookingForm({
  slug,
  clinicName,
  stomatolog,
  pocetak,
  dentistLabel,
  slotLabel,
  today,
  profile,
  accountChildren,
  initialDependentId,
  childDateOfBirth,
  onChildDateOfBirth,
  notice,
}: {
  slug: string;
  clinicName: string;
  stomatolog: string;
  pocetak: string;
  dentistLabel: string | null;
  slotLabel: string;
  today: string;
  profile: SelfBookingFields;
  accountChildren: BookingChild[];
  initialDependentId?: string;
  childDateOfBirth: string;
  onChildDateOfBirth: (value: string) => void;
  notice: string | null;
}) {
  const bookable = accountChildren.filter((child) => isChildRoute(child.dateOfBirth, today));
  const initial = bookable.find((child) => child.id === initialDependentId) ?? null;
  const [dependentId, setDependentId] = useState(initial?.id ?? "");
  const [childFirstName, setChildFirstName] = useState(initial?.firstName ?? "");
  const [childLastName, setChildLastName] = useState(initial?.lastName ?? "");
  const [identityDob, setIdentityDob] = useState(initial?.dateOfBirth ?? childDateOfBirth);
  const [relationship, setRelationship] = useState(initial?.relationship ?? "");
  const [contactFirstName, setContactFirstName] = useState(profile.firstName);
  const [contactLastName, setContactLastName] = useState(profile.lastName);
  const [contactPhone, setContactPhone] = useState(profile.phone ?? "");
  const selected = bookable.find((child) => child.id === dependentId) ?? null;
  const [result, formAction, pending] = useActionState<BookingResult, FormData>(submitChildBooking, null);
  const followUp = bookingFollowUp(result, slug);
  if (followUp) {
    return followUp;
  }
  const error = result && !result.ok ? result : null;

  function pickChild(id: string) {
    const next = bookable.find((child) => child.id === id) ?? null;
    setDependentId(id);
    setChildFirstName(next?.firstName ?? "");
    setChildLastName(next?.lastName ?? "");
    setIdentityDob(next?.dateOfBirth ?? childDateOfBirth);
    setRelationship(next?.relationship ?? "");
  }

  function onDate(value: string) {
    setIdentityDob(value);
    if (!dependentId) {
      onChildDateOfBirth(value);
    }
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 text-card-foreground"
      noValidate
      onReset={(event) => event.preventDefault()}
    >
      <h2 className="text-lg font-semibold">Zakazivanje za dete</h2>
      <SlotSummary dentistLabel={dentistLabel} slotLabel={slotLabel} />
      {notice ? <p className="text-sm">{notice}</p> : null}
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="stomatolog" value={stomatolog} />
      <input type="hidden" name="pocetak" value={pocetak} />

      {bookable.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="booking-child" className="text-sm font-medium">
            Dete
          </label>
          <select
            id="booking-child"
            name="dependentId"
            value={dependentId}
            onChange={(event) => pickChild(event.target.value)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm text-foreground"
          >
            <option value="">Novo dete</option>
            {bookable.map((child) => (
              <option key={child.id} value={child.id}>
                {child.firstName} {child.lastName} ({relationshipLabel(child.relationship)})
              </option>
            ))}
          </select>
        </div>
      ) : (
        <input type="hidden" name="dependentId" value="" />
      )}

      {selected?.linked ? (
        <p className="text-sm">
          Termin je za {selected.firstName} {selected.lastName}.
        </p>
      ) : (
        <>
          <h3 className="text-sm font-semibold">Dete</h3>
          <Field
            id="child-first-name"
            label="Ime"
            name="childFirstName"
            autoComplete="off"
            value={childFirstName}
            onChange={setChildFirstName}
            error={error?.fieldErrors?.childFirstName?.[0]}
          />
          <Field
            id="child-last-name"
            label="Prezime"
            name="childLastName"
            autoComplete="off"
            value={childLastName}
            onChange={setChildLastName}
            error={error?.fieldErrors?.childLastName?.[0]}
          />
          <DateField
            id="child-birth"
            name="childDateOfBirth"
            value={identityDob}
            onChange={onDate}
            today={today}
            error={error?.fieldErrors?.childDateOfBirth?.[0]}
          />
          <RelationshipField value={relationship} onChange={setRelationship} error={error?.fieldErrors?.relationship?.[0]} />

          <h3 className="text-sm font-semibold">Roditelj ili staratelj</h3>
          <Field
            id="contact-first-name"
            label="Ime"
            name="contactFirstName"
            autoComplete="given-name"
            value={contactFirstName}
            onChange={setContactFirstName}
            error={error?.fieldErrors?.contactFirstName?.[0]}
          />
          <Field
            id="contact-last-name"
            label="Prezime"
            name="contactLastName"
            autoComplete="family-name"
            value={contactLastName}
            onChange={setContactLastName}
            error={error?.fieldErrors?.contactLastName?.[0]}
          />
          <Field
            id="contact-phone"
            label="Telefon"
            name="contactPhone"
            type="tel"
            autoComplete="tel"
            value={contactPhone}
            onChange={setContactPhone}
            error={error?.fieldErrors?.contactPhone?.[0]}
          />
          <Field
            id="contact-email"
            label="Mejl"
            name="contactEmail"
            type="email"
            autoComplete="email"
            defaultValue={profile.email}
            readOnly
            error={error?.fieldErrors?.contactEmail?.[0]}
          />
        </>
      )}

      <ReasonField id="child-reason" error={error?.fieldErrors?.reason?.[0]} />
      <CheckField
        id="child-guardian"
        name="guardian"
        label={GUARDIAN_STATEMENT}
        error={error?.fieldErrors?.guardian?.[0]}
      />
      {selected?.linked ? null : (
        <CheckField
          id="child-consent"
          name="consent"
          label={bookingConsentText(clinicName)}
          error={error?.fieldErrors?.consent?.[0]}
        />
      )}
      <p className="text-sm text-muted-foreground">{NOT_PROCEDURE_CONSENT}</p>
      {error && !error.fieldErrors ? <FormAlert message={error.error} /> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Slanje…" : "Pošalji zahtev"}
      </Button>
    </form>
  );
}

function bookableChild(accountChildren: BookingChild[], today: string, id: string | undefined): BookingChild | null {
  if (!id) {
    return null;
  }
  return accountChildren.find((child) => child.id === id && isChildRoute(child.dateOfBirth, today)) ?? null;
}

function WhoChoice({ who, onSelf, onChild }: { who: "self" | "child"; onSelf: () => void; onChild: () => void }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">Za koga je termin</legend>
      <label className="flex items-center gap-2 text-sm whitespace-nowrap">
        <input
          type="radio"
          name="bookingFor"
          value="self"
          checked={who === "self"}
          onChange={onSelf}
          className="size-4 accent-primary"
        />
        Za mene
      </label>
      <label className="flex items-center gap-2 text-sm whitespace-nowrap">
        <input
          type="radio"
          name="bookingFor"
          value="child"
          checked={who === "child"}
          onChange={onChild}
          className="size-4 accent-primary"
        />
        Za dete mlađe od 15 godina
      </label>
    </fieldset>
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
  const followUp = bookingFollowUp(result, slug);
  if (followUp) {
    return followUp;
  }
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
  const [firstName, setFirstName] = useState(profile.firstName);
  const [lastName, setLastName] = useState(profile.lastName);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [result, formAction, pending] = useActionState<BookingResult, FormData>(submitSelfBooking, null);
  const followUp = bookingFollowUp(result, slug);
  if (followUp) {
    return followUp;
  }
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
        value={firstName}
        onChange={setFirstName}
        error={error?.fieldErrors?.firstName?.[0]}
      />
      <Field
        id="booking-last-name"
        label="Prezime"
        name="lastName"
        autoComplete="family-name"
        value={lastName}
        onChange={setLastName}
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
        value={phone}
        onChange={setPhone}
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

      <CheckField
        id="booking-consent"
        name="consent"
        label={bookingConsentText(clinicName)}
        error={error?.fieldErrors?.consent?.[0]}
      />

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

function ReasonField({ id = "booking-reason", error }: { id?: string; error?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        Razlog dolaska <span className="font-normal text-muted-foreground">(nije obavezno)</span>
      </label>
      <textarea
        id={id}
        name="reason"
        rows={3}
        maxLength={300}
        className="w-full rounded-md border border-input bg-transparent px-2.5 py-2 text-sm text-foreground"
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

function RelationshipField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: BookingChild["relationship"] | "") => void;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="child-relationship" className="text-sm font-medium">
        Odnos
      </label>
      <select
        id="child-relationship"
        name="relationship"
        value={value}
        onChange={(event) => onChange(event.target.value as BookingChild["relationship"] | "")}
        className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm text-foreground"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "child-relationship-error" : undefined}
      >
        <option value="">Izaberite odnos</option>
        <option value="mother">{relationshipLabel("mother")}</option>
        <option value="father">{relationshipLabel("father")}</option>
        <option value="guardian">{relationshipLabel("guardian")}</option>
        <option value="grandmother">{relationshipLabel("grandmother")}</option>
        <option value="grandfather">{relationshipLabel("grandfather")}</option>
        <option value="other_relative">{relationshipLabel("other_relative")}</option>
      </select>
      {error ? (
        <p id="child-relationship-error" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function DateField({
  id,
  name = "dateOfBirth",
  value,
  onChange,
  today,
  error,
}: {
  id: string;
  name?: string;
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
        name={name}
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
  value,
  onChange,
  readOnly = false,
}: {
  id: string;
  label: string;
  name: string;
  error?: string;
  type?: string;
  autoComplete?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
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
        readOnly={readOnly}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...(onChange
          ? { value: value ?? "", onChange: (event) => onChange(event.target.value) }
          : { defaultValue })}
      />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function CheckField({ id, name, label, error }: { id: string; name: string; label: string; error?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex items-start gap-2 text-sm">
        <input
          id={id}
          type="checkbox"
          name={name}
          value="yes"
          className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <span>{label}</span>
      </label>
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function RequestReceived() {
  return (
    <section role="status" className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-card-foreground">
      <p className="text-sm">{REQUEST_RECEIVED}</p>
      <p className="w-fit rounded-md bg-muted px-2 py-1 text-sm font-medium text-foreground">
        {bookingRequestStatusLabel("pending")}
      </p>
    </section>
  );
}

function SlotTaken({ slug }: { slug: string }) {
  return (
    <section role="alert" className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground">
      <p className="text-sm">{SLOT_TAKEN}</p>
      <Link href={freeStartsHref(slug)} className="text-sm text-primary underline-offset-4 hover:underline">
        Slobodni počeci
      </Link>
    </section>
  );
}

function FormAlert({ message }: { message: string }) {
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}
