"use client";

import { useActionState, useState, useTransition, type ReactNode } from "react";
import { Check, CaretDown } from "@phosphor-icons/react";
import { Combobox } from "@base-ui/react/combobox";

import { createAppointment, updateAppointment } from "@/app/actions/appointments";
import { loadAvailableAppointmentSlots } from "@/app/actions/appointment-slots";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";
import { formatBelgrade, formatBelgradeDate, hasTurned15, isIsoDate } from "@/lib/calendar-dates";
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
  onCreated,
}: {
  choices: AppointmentFormChoices;
  datum: string;
  today: string;
  defaultDentistId?: string | null;
  termin?: ExistingAppointment | null;
  embedded?: boolean;
  onCreated?: () => void;
}) {
  const [result, formAction, pending] = useActionState<ActionResult<{ id: string }> | null, FormData>(
    async (previous, formData) => {
      const next = await (termin ? updateAppointment : createAppointment)(previous, formData);
      if (next.ok && !termin) onCreated?.();
      return next;
    },
    null,
  );
  const { dentists, patients, types, slotMinutes } = choices;
  const startDefault = termin ? new Date(termin.startsAt) : null;
  const initialDate = startDefault ? formatBelgradeDate(startDefault) : isIsoDate(datum) ? datum : today;
  const [appointmentDate, setAppointmentDate] = useState(initialDate < today ? today : initialDate);
  const [appointmentTime, setAppointmentTime] = useState(
    startDefault && initialDate >= today
      ? formatBelgrade(startDefault, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      : "",
  );
  const [patientId, setPatientId] = useState(
    termin && patients.some((patient) => patient.id === termin.patientId)
      ? termin.patientId
      : "",
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
  const [selectedDentistId, setSelectedDentistId] = useState(dentistDefault);
  const durations = durationChoices(slotMinutes);
  const durationDefault =
    termin && durations.includes(termin.durationMinutes)
      ? String(termin.durationMinutes)
      : durations.includes(30)
        ? "30"
        : String(slotMinutes);
  const [duration, setDuration] = useState(durationDefault);
  const [slotDialogOpen, setSlotDialogOpen] = useState(false);
  const [availableTimes, setAvailableTimes] = useState<ActionResult<string[]> | null>(null);
  const [slotsPending, startSlotsTransition] = useTransition();
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

  function openTimePicker() {
    setSlotDialogOpen(true);
    setAvailableTimes(null);
    startSlotsTransition(async () => {
      const slots = await loadAvailableAppointmentSlots({
        dentistId: selectedDentistId,
        date: appointmentDate,
        duration: Number(duration),
        excludeAppointmentId: termin?.id ?? null,
      });
      setAvailableTimes(slots);
    });
  }

  return (
    <form
      id={termin ? "izmena-termina" : "novi-termin"}
      action={formAction}
      noValidate
      className={
        embedded
          ? "grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2"
          : "flex max-w-lg flex-col gap-4 rounded-lg border border-border bg-card p-4 text-card-foreground"
      }
    >
      {embedded ? null : (
        <h2 className="text-lg font-semibold text-foreground">{termin ? "Izmena termina" : "Novi termin"}</h2>
      )}
      {termin ? <input type="hidden" name="termin" value={termin.id} /> : null}
      <Field
        id="appointment-dentist"
        label="Stomatolog"
        labelFor={dentists.length === 1 ? null : undefined}
        message={dentistError}
      >
        {dentists.length === 1 ? (
          <>
            <input type="hidden" name="stomatolog" value={dentists[0].id} />
            <div
              role="group"
              aria-labelledby="appointment-dentist-label"
              className={`${controlClass} flex items-center`}
            >
              {dentists[0].label}
            </div>
          </>
        ) : (
          <select
            id="appointment-dentist"
            name="stomatolog"
            value={selectedDentistId}
            onChange={(event) => {
              setSelectedDentistId(event.target.value);
              setAppointmentTime("");
            }}
            required
            aria-invalid={dentistError ? true : undefined}
            aria-describedby={describedBy("appointment-dentist", dentistError)}
            className={controlClass}
          >
            <ChoiceOptions rows={dentists} />
          </select>
        )}
      </Field>
      <Field id="appointment-patient" label="Pacijent" message={patientError}>
        <input type="hidden" name="pacijent" value={patientId} />
        <Combobox.Root
          items={patients}
          value={selected}
          onValueChange={(patient) => setPatientId(patient?.id ?? "")}
          itemToStringLabel={(patient) => patient.label}
          itemToStringValue={(patient) => patient.id}
        >
          <Combobox.InputGroup className="relative">
            <Combobox.Input
              id="appointment-patient"
              placeholder="Pretražite pacijente"
              required
              aria-invalid={patientError ? true : undefined}
              aria-describedby={describedBy("appointment-patient", patientError)}
              className={`${controlClass} pr-9 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20`}
            />
            <Combobox.Trigger
              aria-label="Prikaži pacijente"
              className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground outline-none focus-visible:text-foreground"
            >
              <CaretDown aria-hidden="true" size={16} />
            </Combobox.Trigger>
          </Combobox.InputGroup>
          <Combobox.Portal>
            <Combobox.Positioner className="z-[60] outline-none" sideOffset={4}>
              <Combobox.Popup className="w-[var(--anchor-width)] max-w-[var(--available-width)] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md">
                <Combobox.Empty className="px-3 py-2 text-sm text-muted-foreground">
                  Nema pronađenih pacijenata.
                </Combobox.Empty>
                <Combobox.List className="max-h-60 overflow-y-auto p-1 outline-none">
                  {(patient: AppointmentPatientChoice) => (
                    <Combobox.Item
                      key={patient.id}
                      value={patient}
                      className="flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                    >
                      <Combobox.ItemIndicator className="flex size-4 items-center justify-center">
                        <Check aria-hidden="true" size={14} />
                      </Combobox.ItemIndicator>
                      <span>{patient.label}</span>
                    </Combobox.Item>
                  )}
                </Combobox.List>
              </Combobox.Popup>
            </Combobox.Positioner>
          </Combobox.Portal>
        </Combobox.Root>
      </Field>
      <Field
        id="appointment-start"
        label="Početak"
        message={startError}
        className={embedded ? "sm:col-span-2" : undefined}
      >
        <input
          type="hidden"
          name="pocetak"
          value={appointmentDate && appointmentTime ? `${appointmentDate}T${appointmentTime}` : ""}
        />
        <div className="grid grid-cols-2 gap-2">
          <label htmlFor="appointment-date" className="flex flex-col gap-1 text-xs text-muted-foreground">
            Datum
            <Input
              id="appointment-date"
              type="date"
              min={today}
              value={appointmentDate}
              onChange={(event) => {
                const nextDate = event.target.value;
                if (nextDate && nextDate < today) return;
                setAppointmentDate(nextDate);
                setAppointmentTime("");
              }}
              required
              aria-invalid={startError ? true : undefined}
              aria-describedby={describedBy("appointment-start", startError)}
            />
          </label>
          <label htmlFor="appointment-time" className="flex flex-col gap-1 text-xs text-muted-foreground">
            Vreme
            <Button
              id="appointment-time"
              type="button"
              variant="outline"
              aria-haspopup="dialog"
              aria-invalid={startError ? true : undefined}
              aria-describedby={describedBy("appointment-start", startError)}
              className="w-full justify-between font-normal"
              onClick={openTimePicker}
            >
              {appointmentTime || "Izaberite slobodan termin"}
            </Button>
          </label>
        </div>
      </Field>
      <Dialog open={slotDialogOpen} onOpenChange={setSlotDialogOpen}>
        <DialogContent className="w-[min(30rem,calc(100%-2rem))]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle>Slobodni termini</DialogTitle>
              <p className="mt-1 text-sm text-muted-foreground">{appointmentDate}</p>
            </div>
            <DialogClose render={<Button type="button" variant="outline" size="sm" />}>
              Zatvori
            </DialogClose>
          </div>
          {slotsPending ? (
            <p role="status" className="text-sm text-muted-foreground">Učitavam slobodne termine…</p>
          ) : availableTimes && !availableTimes.ok ? (
            <p role="alert" className="text-sm text-destructive">{availableTimes.error}</p>
          ) : availableTimes?.ok && availableTimes.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nema slobodnih termina za izabrani datum.</p>
          ) : availableTimes?.ok ? (
            <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
              {availableTimes.data.map((time) => (
                <Button
                  key={time}
                  type="button"
                  variant={appointmentTime === time ? "default" : "outline"}
                  onClick={() => {
                    setAppointmentTime(time);
                    setSlotDialogOpen(false);
                  }}
                >
                  {time}
                </Button>
              ))}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <Field id="appointment-duration" label="Trajanje" message={durationError}>
        <select
          id="appointment-duration"
          name="trajanje"
          value={duration}
          onChange={(event) => {
            setDuration(event.target.value);
            setAppointmentTime("");
          }}
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
      <Field id="appointment-note" label="Napomena" message={noteError} className={embedded ? "sm:col-span-2" : undefined}>
        <textarea
          id="appointment-note"
          name="napomena"
          rows={embedded ? 2 : 3}
          maxLength={1000}
          defaultValue={termin ? termin.note : undefined}
          aria-invalid={noteError ? true : undefined}
          aria-describedby={describedBy("appointment-note", noteError)}
          className={embedded ? `${areaClass} min-h-14` : areaClass}
        />
      </Field>
      {askForContact ? (
        <fieldset className={`flex flex-col gap-3 rounded-md border border-border p-3 ${embedded ? "sm:col-span-2" : ""}`}>
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
        <p className={`text-sm text-muted-foreground ${embedded ? "sm:col-span-2" : ""}`}>Kontakt roditelja ili srodnika je već unet.</p>
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
      <Button type="submit" disabled={pending} className={`self-start ${embedded ? "sm:col-span-2" : ""}`}>
        {termin ? "Sačuvaj" : "Kreiraj"}
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
  labelFor = id,
  message,
  className,
  children,
}: {
  id: string;
  label: string;
  labelFor?: string | null;
  message?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      {labelFor ? (
        <label htmlFor={labelFor} className="text-sm font-medium text-foreground">
          {label}
        </label>
      ) : (
        <span id={`${id}-label`} className="text-sm font-medium text-foreground">
          {label}
        </span>
      )}
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
