"use client";

import { useActionState, useEffect, type ReactNode } from "react";

import { saveAnamnesis } from "@/app/actions/patients";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";

import { normalizeAnamnesis, type ChartAnamnesis } from "./anamnesis";

const CHECK = "Proverite unete podatke.";

const areaClass =
  "min-h-20 w-full rounded-md border border-input bg-transparent px-2.5 py-2 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export type { ChartAnamnesis } from "./anamnesis";
export { EMPTY_ANAMNESIS, normalizeAnamnesis } from "./anamnesis";

const fields = [
  { id: "anamnesis-chronic", name: "chronicConditions", label: "Hronične bolesti", key: "chronicConditions" },
  { id: "anamnesis-medications", name: "medications", label: "Lekovi", key: "medications" },
  { id: "anamnesis-allergies", name: "allergies", label: "Alergije", key: "allergies" },
  { id: "anamnesis-pregnancy", name: "pregnancy", label: "Trudnoća", key: "pregnancy" },
] as const;

type AnamnesisFormProps = {
  patientId: string;
  anamnesis: ChartAnamnesis;
  onCancel: () => void;
  onSaved: () => void;
};

export function AnamnesisForm({ patientId, anamnesis, onCancel, onSaved }: AnamnesisFormProps) {
  const values = normalizeAnamnesis(anamnesis);
  const [result, formAction, pending] = useActionState<ActionResult<{ patientId: string }> | null, FormData>(
    saveAnamnesis,
    null,
  );
  const generalError = generalMessage(result);

  useEffect(() => {
    if (result?.ok) onSaved();
  }, [onSaved, result]);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="patientId" value={patientId} />
      {fields.map((field) => {
        const message = fieldMessage(result, field.name);
        return (
          <Field key={field.id} id={field.id} label={field.label} message={message}>
            <textarea
              id={field.id}
              name={field.name}
              rows={3}
              maxLength={4000}
              defaultValue={values[field.key]}
              aria-invalid={message ? true : undefined}
              className={areaClass}
            />
          </Field>
        );
      })}
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

export function AnamnesisView({ anamnesis }: { anamnesis: ChartAnamnesis }) {
  const values = normalizeAnamnesis(anamnesis);
  return (
    <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
      {fields.map((field) => (
        <div key={field.id} className="grid gap-1 sm:col-span-2">
          <dt className="font-medium text-muted-foreground">{field.label}</dt>
          <dd className="whitespace-pre-wrap text-foreground">
            {values[field.key].trim() || "—"}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function generalMessage(result: ActionResult<{ patientId: string }> | null): string {
  if (!result || result.ok) return "";
  if (result.error === CHECK) return "";
  return result.error;
}

function fieldMessage(result: ActionResult<{ patientId: string }> | null, field: string): string | undefined {
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
