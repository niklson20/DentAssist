"use client";

import { useActionState, useState, type ReactNode } from "react";

import { createAppointment, updateAppointment } from "@/app/actions/appointments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";
import { hasTurned15, isIsoDate } from "@/lib/calendar-dates";
import { RELATIONSHIPS, relationshipLabel } from "@/lib/labels";
import type { SlotMinutes } from "@/lib/slots";

export type AppointmentChoice = {
  id: string;
  label: string;
};

export type AppointmentPatientChoice = AppointmentChoice & {
  dateOfBirth: string | null;
  hasContact: boolean;
};

export type AppointmentFormChoices = {
  dentists: readonly AppointmentChoice[];
  patients: readonly AppointmentPatientChoice[];
  types: readonly AppointmentChoice[];
  slotMinutes: SlotMinutes;
};

export type ExistingAppointment = {
  id: string;
  dentistId: string;
  patientId: string;
  startsAt: string;
  durationMinutes: number;
  typeId: string;
  note: string;
};

const controlClass =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

const areaClass =
  "min-h-20 w-full rounded-md border border-input bg-transparent px-2.5 py-2 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function AppointmentForm({
  choices,
  datum,
  today,
  defaultDentistId = null,
  termin = null,
  embedded = false,
}: {
  choices: AppointmentFormChoices;
  datum: string;
  today: string;
  defaultDentistId?: string | null;
  termin?: ExistingAppointment | null;
  embedded?: boolean;
}) {
  const [result, formAction, pending] = useActionState<ActionResult<{ id: string }> | null, FormData>(
    termin ? updateAppointment : createAppointment,
    null,
  );
  const { dentists, patients, types, slotMinutes } = choices;
  const [patientId, setPatientId] = useState(
    termin && patients.some((patient) => patient.id === termin.patientId)
      ? termin.patientId
      : (patients[0]?.id ?? ""),
  );
  const selected = patients.find((patient) => patient.id === patientId) ?? null;
  const askForContact = selected ? isUnder15(selected, today) && !selected.hasContact : false;
  const contactOnFile = selected ? isUnder15(selected, today) && selected.hasContact : false;
  const dentistFromTermin =
    termin && dentists.some((dentist) => dentist.id === termin.dentistId) ? termin.dentistId : null;
  const dentistDefault =
    dentistFromTermin ??
    (defaultDentistId && dentists.some((dentist) => dentist.id === defaultDentistId)
      ? defaultDentistId
      : (dentists[0]?.id ?? ""));
  const durations = durationChoices(slotMinutes);
  const durationDefault =
    termin && durations.includes(termin.durationMinutes)
      ? String(termin.durationMinutes)
      : durations.includes(30)
        ? "30"
        : String(slotMinutes);
  const startDefault = termin ? termin.startsAt : isIsoDate(datum) ? `${datum}T09:00` : "";
  const typeDefault =
    termin && types.some((type) => type.id === termin.typeId) ? termin.typeId : (types[0]?.id ?? "");
  const formError = result && !result.ok ? result.error : null;
  const dentistError = message(result, "stomatolog");
  const patientError = message(result, "pacijent");
  const startError = message(result, "pocetak");
  const durationError = message(result, "trajanje");
  const typeError = message(result, "tip");
  const noteError = message(result, "napomena");
  const relationshipError = message(result, "kontaktOdnos");
  const firstNameError = message(result, "kontaktIme");
  const lastNameError = message(result, "kontaktPrezime");
  const phoneError = message(result, "kontaktTelefon");
  const emailError = message(result, "kontaktMejl");

  return (
    <form
      id={termin ? "izmena-termina" : "novi-termin"}
      action={formAction}
      noValidate
      className={
        embedded
          ? "flex flex-col gap-4"
          : "flex max-w-lg flex-col gap-4 rounded-lg border border-border bg-card p-4 text-card-foreground"
      }
    >
      {embedded ? null : (
        <h2 className="text-lg font-semibold text-foreground">{termin ? "Izmena termina" : "Novi termin"}</h2>
      )}
      {termin ? <input type="hidden" name="termin" value={termin.id} /> : null}
      <Field id="appointment-dentist" label="Stomatolog" message={dentistError}>
        <select
          id="appointment-dentist"
          name="stomatolog"
          defaultValue={dentistDefault}
          required
          aria-invalid={dentistError ? true : undefined}
          aria-describedby={describedBy("appointment-dentist", dentistError)}
          className={controlClass}
        >
          <ChoiceOptions rows={dentists} />
        </select>
      </Field>
      <Field id="appointment-patient" label="Pacijent" message={patientError}>
        <select
          id="appointment-patient"
          name="pacijent"
          value={patientId}
          onChange={(event) => setPatientId(event.target.value)}
          required
          aria-invalid={patientError ? true : undefined}
          aria-describedby={describedBy("appointment-patient", patientError)}
          className={controlClass}
        >
          <ChoiceOptions rows={patients} />
        </select>
      </Field>
      <Field id="appointment-start" label="Početak" message={startError}>
        <Input
          id="appointment-start"
          name="pocetak"
          type="datetime-local"
          defaultValue={startDefault}
          required
          aria-invalid={startError ? true : undefined}
          aria-describedby={describedBy("appointment-start", startError)}
        />
      </Field>
      <Field id="appointment-duration" label="Trajanje" message={durationError}>
        <select
          id="appointment-duration"
          name="trajanje"
          defaultValue={durationDefault}
          required
          aria-invalid={durationError ? true : undefined}
          aria-describedby={describedBy("appointment-duration", durationError)}
          className={controlClass}
        >
          {durations.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes} minuta
            </option>
          ))}
        </select>
      </Field>
      <Field id="appointment-type" label="Tip" message={typeError}>
        <select
          id="appointment-type"
          name="tip"
          defaultValue={typeDefault}
          required
          aria-invalid={typeError ? true : undefined}
          aria-describedby={describedBy("appointment-type", typeError)}
          className={controlClass}
        >
          <ChoiceOptions rows={types} />
        </select>
      </Field>
      <Field id="appointment-note" label="Napomena" message={noteError}>
        <textarea
          id="appointment-note"
          name="napomena"
          rows={3}
          maxLength={1000}
          defaultValue={termin ? termin.note : undefined}
          aria-invalid={noteError ? true : undefined}
          aria-describedby={describedBy("appointment-note", noteError)}
          className={areaClass}
        />
      </Field>
      {askForContact ? (
        <fieldset className="flex flex-col gap-4 rounded-md border border-border p-4">
          <legend className="px-1 text-sm font-medium text-foreground">Kontakt roditelja ili srodnika</legend>
          <Field id="appointment-contact-relationship" label="Odnos" message={relationshipError}>
            <select
              id="appointment-contact-relationship"
              name="kontaktOdnos"
              defaultValue=""
              required
              aria-invalid={relationshipError ? true : undefined}
              aria-describedby={describedBy("appointment-contact-relationship", relationshipError)}
              className={controlClass}
            >
              <option value="">Izaberite</option>
              {RELATIONSHIPS.map((relationship) => (
                <option key={relationship} value={relationship}>
                  {relationshipLabel(relationship)}
                </option>
              ))}
            </select>
          </Field>
          <Field id="appointment-contact-first-name" label="Ime" message={firstNameError}>
            <Input
              id="appointment-contact-first-name"
              name="kontaktIme"
              required
              aria-invalid={firstNameError ? true : undefined}
              aria-describedby={describedBy("appointment-contact-first-name", firstNameError)}
            />
          </Field>
          <Field id="appointment-contact-last-name" label="Prezime" message={lastNameError}>
            <Input
              id="appointment-contact-last-name"
              name="kontaktPrezime"
              required
              aria-invalid={lastNameError ? true : undefined}
              aria-describedby={describedBy("appointment-contact-last-name", lastNameError)}
            />
          </Field>
          <Field id="appointment-contact-phone" label="Telefon" message={phoneError}>
            <Input
              id="appointment-contact-phone"
              name="kontaktTelefon"
              type="tel"
              required
              aria-invalid={phoneError ? true : undefined}
              aria-describedby={describedBy("appointment-contact-phone", phoneError)}
            />
          </Field>
          <Field id="appointment-contact-email" label="Mejl" message={emailError}>
            <Input
              id="appointment-contact-email"
              name="kontaktMejl"
              type="email"
              aria-invalid={emailError ? true : undefined}
              aria-describedby={describedBy("appointment-contact-email", emailError)}
            />
          </Field>
        </fieldset>
      ) : null}
      {contactOnFile ? (
        <p className="text-sm text-muted-foreground">Kontakt roditelja ili srodnika je već unet.</p>
      ) : null}
      {result?.ok ? (
        <p role="status" className="text-sm text-foreground">
          {termin ? "Termin je izmenjen." : "Termin je sačuvan."}
        </p>
      ) : null}
      {formError ? (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="self-start">
        Sačuvaj
      </Button>
    </form>
  );
}

function ChoiceOptions({ rows }: { rows: readonly AppointmentChoice[] }) {
  return (
    <>
      <option value="">Izaberite</option>
      {rows.map((row) => (
        <option key={row.id} value={row.id}>
          {row.label}
        </option>
      ))}
    </>
  );
}

function Field({
  id,
  label,
  message,
  children,
}: {
  id: string;
  label: string;
  message?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {message ? (
        <p id={errorId(id)} className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function isUnder15(patient: AppointmentPatientChoice, today: string): boolean {
  if (patient.dateOfBirth === null || !isIsoDate(patient.dateOfBirth) || !isIsoDate(today)) {
    return false;
  }
  return !hasTurned15(patient.dateOfBirth, today);
}

function durationChoices(slotMinutes: SlotMinutes): number[] {
  const minutes: number[] = [];
  for (let cursor = slotMinutes; cursor <= 120; cursor += slotMinutes) {
    minutes.push(cursor);
  }
  return minutes;
}

function message(result: ActionResult<{ id: string }> | null, field: string): string | undefined {
  if (!result || result.ok) return undefined;
  return result.fieldErrors?.[field]?.[0];
}

function describedBy(id: string, messageText?: string): string | undefined {
  return messageText ? errorId(id) : undefined;
}

function errorId(id: string): string {
  return `${id}-error`;
}
