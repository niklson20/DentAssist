"use client";

import { useActionState, type ReactNode } from "react";

import { DUPLICATE_CONFIRMATION_REQUIRED } from "@/app/pacijenti/search-schema";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";
import { SEXES, sexLabels } from "@/lib/labels";

const CHECK_ENTRY = "Proverite unos.";

const controlClass =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const areaClass =
  "min-h-20 w-full rounded-md border border-input bg-transparent px-2.5 py-2 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export type NewPatientDraft = {
  firstName: string;
  lastName: string;
  phone: string;
  dateOfBirth: string;
  sex: string;
  email: string;
  address: string;
  note: string;
  needsDuplicateConfirmation: boolean;
  error: string;
};

type CreatePatientAction = (
  previous: ActionResult<{ slug: string }> | null,
  formData: FormData,
) => Promise<ActionResult<{ slug: string }>>;

export function NewPatientDialog({
  action,
  clinical,
  today,
  draft,
}: {
  action: CreatePatientAction;
  clinical: boolean;
  today: string;
  draft: NewPatientDraft;
}) {
  return (
    <Dialog defaultOpen={draft.needsDuplicateConfirmation || draft.error.length > 0}>
      <DialogTrigger render={<Button type="button" />}>Novi pacijent</DialogTrigger>
      <DialogContent>
        <div className="flex items-start justify-between gap-3">
          <DialogTitle>Novi pacijent</DialogTitle>
          <DialogClose render={<Button type="button" variant="outline" size="sm" />}>Zatvori</DialogClose>
        </div>
        <NewPatientForm action={action} clinical={clinical} today={today} draft={draft} />
      </DialogContent>
    </Dialog>
  );
}

export function NewPatientForm({
  action,
  clinical,
  today,
  draft,
}: {
  action: CreatePatientAction;
  clinical: boolean;
  today: string;
  draft: NewPatientDraft;
}) {
  const [result, formAction, pending] = useActionState<ActionResult<{ slug: string }> | null, FormData>(action, null);
  const askDuplicate =
    draft.needsDuplicateConfirmation ||
    (result !== null && !result.ok && result.error === DUPLICATE_CONFIRMATION_REQUIRED);
  const generalError = generalMessage(result, draft.error);

  return (
        <form action={formAction} className="flex flex-col gap-4" noValidate>
          <Field id="patient-first-name" label="Ime" message={fieldMessage(result, "firstName")}>
            <Input
              id="patient-first-name"
              name="firstName"
              defaultValue={draft.firstName}
              autoComplete="given-name"
              aria-invalid={fieldMessage(result, "firstName") ? true : undefined}
            />
          </Field>
          <Field id="patient-last-name" label="Prezime" message={fieldMessage(result, "lastName")}>
            <Input
              id="patient-last-name"
              name="lastName"
              defaultValue={draft.lastName}
              autoComplete="family-name"
              aria-invalid={fieldMessage(result, "lastName") ? true : undefined}
            />
          </Field>
          <Field id="patient-phone" label="Telefon" message={fieldMessage(result, "phone")}>
            <Input
              id="patient-phone"
              name="phone"
              type="tel"
              defaultValue={draft.phone}
              autoComplete="tel"
              aria-invalid={fieldMessage(result, "phone") ? true : undefined}
            />
          </Field>
          <Field id="patient-birth-date" label="Datum rođenja" message={fieldMessage(result, "dateOfBirth")}>
            <Input
              id="patient-birth-date"
              name="dateOfBirth"
              type="date"
              max={today}
              defaultValue={draft.dateOfBirth}
              autoComplete="bday"
              aria-invalid={fieldMessage(result, "dateOfBirth") ? true : undefined}
            />
          </Field>
          <Field id="patient-sex" label="Pol" message={fieldMessage(result, "sex")}>
            <select
              id="patient-sex"
              name="sex"
              defaultValue={draft.sex}
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
          <Field id="patient-email" label="Mejl" message={fieldMessage(result, "email")}>
            <Input
              id="patient-email"
              name="email"
              type="email"
              defaultValue={draft.email}
              autoComplete="email"
              aria-invalid={fieldMessage(result, "email") ? true : undefined}
            />
          </Field>
          <Field id="patient-address" label="Adresa" message={fieldMessage(result, "address")}>
            <Input
              id="patient-address"
              name="address"
              defaultValue={draft.address}
              autoComplete="street-address"
              aria-invalid={fieldMessage(result, "address") ? true : undefined}
            />
          </Field>
          {clinical ? (
            <Field id="patient-jmbg" label="JMBG" message={fieldMessage(result, "jmbg")}>
              <Input
                id="patient-jmbg"
                name="jmbg"
                inputMode="numeric"
                maxLength={13}
                autoComplete="off"
                aria-invalid={fieldMessage(result, "jmbg") ? true : undefined}
              />
            </Field>
          ) : null}
          <Field id="patient-note" label="Beleška" message={fieldMessage(result, "note")}>
            <textarea
              id="patient-note"
              name="note"
              defaultValue={draft.note}
              className={areaClass}
              aria-invalid={fieldMessage(result, "note") ? true : undefined}
            />
          </Field>
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
          <Button type="submit" className="self-center" disabled={pending}>
            Sačuvaj karton
          </Button>
        </form>
  );
}

function generalMessage(result: ActionResult<{ slug: string }> | null, draftError: string): string {
  if (result && !result.ok && result.error !== CHECK_ENTRY && result.error !== DUPLICATE_CONFIRMATION_REQUIRED) {
    return result.error;
  }
  if (!result && draftError && draftError !== DUPLICATE_CONFIRMATION_REQUIRED) {
    return draftError;
  }
  return "";
}

function fieldMessage(result: ActionResult<{ slug: string }> | null, field: string): string | undefined {
  if (!result || result.ok) {
    return undefined;
  }
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
