"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";

import { saveLegalData } from "./actions";
import type { LegalDataView } from "./load-legal-data";

export function LegalDataForm({ fields }: { fields: LegalDataView }) {
  const [result, formAction, pending] = useActionState<ActionResult<{ saved: true }> | null, FormData>(
    saveLegalData,
    null,
  );
  const error = result && !result.ok ? result : null;

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <p className="text-sm text-muted-foreground">
        Ovi podaci nisu javni i ne utiču na pokretanje online zakazivanja.
      </p>

      {result?.ok ? (
        <p className="text-sm" role="status">
          Pravni podaci su sačuvani.
        </p>
      ) : null}

      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 text-card-foreground">
        <Field
          id="taxId"
          label="PIB"
          name="taxId"
          defaultValue={fields.taxId}
          error={error?.fieldErrors?.taxId?.[0]}
        />
        <Field
          id="registrationNumber"
          label="Matični broj"
          name="registrationNumber"
          defaultValue={fields.registrationNumber}
          error={error?.fieldErrors?.registrationNumber?.[0]}
        />
        <Field
          id="licenseNumber"
          label="Broj rešenja"
          name="licenseNumber"
          defaultValue={fields.licenseNumber}
          error={error?.fieldErrors?.licenseNumber?.[0]}
        />
      </div>

      {error?.error && !error.fieldErrors ? (
        <p className="text-sm text-destructive">{error.error}</p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Čuvanje…" : "Sačuvaj"}
      </Button>
    </form>
  );
}

function Field({
  id,
  label,
  name,
  defaultValue,
  error,
}: {
  id: string;
  label: string;
  name: string;
  defaultValue: string;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={id}
        name={name}
        defaultValue={defaultValue}
        maxLength={50}
        autoComplete="off"
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
