"use client";

import { useActionState, useEffect, type ReactNode } from "react";

import { saveChartDetails } from "@/app/actions/patients";
import { DUPLICATE_CONFIRMATION_REQUIRED } from "@/app/pacijenti/search-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";
import { SEXES, sexLabels } from "@/lib/labels";
import { formatPhone } from "@/lib/phone";

import type { ChartHeaderPatient } from "./chart-header";

const CHECK = "Proverite unete podatke.";

const controlClass =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const areaClass =
  "min-h-20 w-full rounded-md border border-input bg-transparent px-2.5 py-2 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type ChartDetailsFormProps = {
  patient: ChartHeaderPatient;
  patientSlug: string;
  clinical: boolean;
  today: string;
  onCancel: () => void;
  onSaved: () => void;
};

export function ChartDetailsForm({
  patient,
  patientSlug,
  clinical,
  today,
  onCancel,
  onSaved,
}: ChartDetailsFormProps) {
  const [result, formAction, pending] = useActionState<ActionResult<{ patientSlug: string }> | null, FormData>(
    saveChartDetails,
    null,
  );
  const askDuplicate = result !== null && !result.ok && result.error === DUPLICATE_CONFIRMATION_REQUIRED;
  const generalError = generalMessage(result);

  useEffect(() => {
    if (result?.ok) onSaved();
  }, [onSaved, result]);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="patientSlug" value={patientSlug} />
      <Field id="chart-first-name" label="Ime" message={fieldMessage(result, "firstName")}>
        <Input
          id="chart-first-name"
          name="firstName"
          defaultValue={patient.firstName}
          autoComplete="given-name"
          autoFocus
          aria-invalid={fieldMessage(result, "firstName") ? true : undefined}
        />
      </Field>
      <Field id="chart-last-name" label="Prezime" message={fieldMessage(result, "lastName")}>
        <Input
          id="chart-last-name"
          name="lastName"
          defaultValue={patient.lastName}
          autoComplete="family-name"
          aria-invalid={fieldMessage(result, "lastName") ? true : undefined}
        />
      </Field>
      <Field id="chart-birth-date" label="Datum rođenja" message={fieldMessage(result, "dateOfBirth")}>
        <Input
          id="chart-birth-date"
          name="dateOfBirth"
          type="date"
          max={today}
          defaultValue={birthDateValue(patient.dateOfBirth)}
          autoComplete="bday"
          aria-invalid={fieldMessage(result, "dateOfBirth") ? true : undefined}
        />
      </Field>
      <Field id="chart-phone" label="Telefon" message={fieldMessage(result, "phone")}>
        <Input
          id="chart-phone"
          name="phone"
          type="tel"
          defaultValue={formatPhone(patient.phone) ?? ""}
          autoComplete="tel"
          aria-invalid={fieldMessage(result, "phone") ? true : undefined}
        />
      </Field>
      <Field id="chart-email" label="Mejl" message={fieldMessage(result, "email")}>
        <Input
          id="chart-email"
          name="email"
          type="email"
          defaultValue={patient.email ?? ""}
          autoComplete="email"
          aria-invalid={fieldMessage(result, "email") ? true : undefined}
        />
      </Field>
      <Field id="chart-sex" label="Pol" message={fieldMessage(result, "sex")}>
        <select
          id="chart-sex"
          name="sex"
          defaultValue={patient.sex ?? ""}
          aria-invalid={fieldMessage(result, "sex") ? true : undefined}
          className={controlClass}
        >
          <option value="">Nije uneto</option>
          {SEXES.map((sex) => (
            <option key={sex} value={sex}>
              {sexLabels[sex]}
            </option>
          ))}
        </select>
      </Field>
      <Field id="chart-address" label="Adresa" message={fieldMessage(result, "address")}>
        <Input
          id="chart-address"
          name="address"
          defaultValue={patient.address ?? ""}
          autoComplete="street-address"
          aria-invalid={fieldMessage(result, "address") ? true : undefined}
        />
      </Field>
      <Field id="chart-note" label="Beleška" message={fieldMessage(result, "note")}>
        <textarea
          id="chart-note"
          name="note"
          defaultValue={patient.note ?? ""}
          className={areaClass}
          aria-invalid={fieldMessage(result, "note") ? true : undefined}
        />
      </Field>
      {clinical ? (
        <Field id="chart-jmbg" label="JMBG" message={fieldMessage(result, "jmbg")}>
          <Input
            id="chart-jmbg"
            name="jmbg"
            inputMode="numeric"
            maxLength={13}
            defaultValue={patient.jmbg ?? ""}
            autoComplete="off"
            aria-invalid={fieldMessage(result, "jmbg") ? true : undefined}
          />
        </Field>
      ) : null}
      {askDuplicate ? (
        <label className="flex items-start gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            name="duplicateConfirmed"
            value="da"
            className="mt-1 size-4 rounded border border-input"
            required
          />
          <span>Potvrđujem da je ovo drugi pacijent sa istim imenom i prezimenom.</span>
        </label>
      ) : null}
      {askDuplicate ? <p className="text-sm text-muted-foreground">{DUPLICATE_CONFIRMATION_REQUIRED}</p> : null}
      {generalError ? <p className="text-sm text-destructive">{generalError}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          Sačuvaj
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Otkaži
        </Button>
      </div>
    </form>
  );
}

export function chartBirthDateLabel(dateOfBirth: string | null): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOfBirth ?? "");
  if (!match) return null;
  return `${Number(match[3])}. ${Number(match[2])}. ${match[1]}.`;
}

function birthDateValue(dateOfBirth: string | null): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(dateOfBirth ?? "");
  return match?.[1] ?? "";
}

function generalMessage(result: ActionResult<{ patientSlug: string }> | null): string {
  if (!result || result.ok) return "";
  if (result.error === CHECK || result.error === DUPLICATE_CONFIRMATION_REQUIRED) return "";
  return result.error;
}

function fieldMessage(result: ActionResult<{ patientSlug: string }> | null, field: string): string | undefined {
  if (!result || result.ok) return undefined;
  return result.fieldErrors?.[field]?.[0];
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
        <p id={`${id}-error`} className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
    </div>
  );
}
