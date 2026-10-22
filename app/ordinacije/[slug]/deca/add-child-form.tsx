"use client";

import { useActionState } from "react";

import { addChild } from "@/app/actions/patient-account";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";
import { RELATIONSHIPS, relationshipLabels } from "@/lib/labels";

type AddChildFormProps = {
  slug: string;
};

export function AddChildForm({ slug }: AddChildFormProps) {
  const [result, formAction, pending] = useActionState<ActionResult<{ saved: true }> | null, FormData>(
    addChild,
    null,
  );
  const error = result && !result.ok ? result : null;

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 text-card-foreground" noValidate>
      <h2 className="text-lg font-semibold">Novo dete</h2>
      <input type="hidden" name="slug" value={slug} />

      {result?.ok ? (
        <p className="text-sm" role="status">
          Dete je dodato.
        </p>
      ) : null}

      <Field
        id="child-first-name"
        label="Ime"
        name="firstName"
        autoComplete="given-name"
        error={error?.fieldErrors?.firstName?.[0]}
      />
      <Field
        id="child-last-name"
        label="Prezime"
        name="lastName"
        autoComplete="family-name"
        error={error?.fieldErrors?.lastName?.[0]}
      />
      <Field
        id="child-birth"
        label="Datum rođenja"
        name="dateOfBirth"
        type="date"
        autoComplete="bday"
        error={error?.fieldErrors?.dateOfBirth?.[0]}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="child-relationship" className="text-sm font-medium">
          Odnos
        </label>
        <select
          id="child-relationship"
          name="relationship"
          defaultValue=""
          className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm text-foreground"
          aria-invalid={error?.fieldErrors?.relationship?.[0] ? true : undefined}
          aria-describedby={error?.fieldErrors?.relationship?.[0] ? "child-relationship-error" : undefined}
        >
          <option value="" disabled>
            Izaberite odnos
          </option>
          {RELATIONSHIPS.map((relationship) => (
            <option key={relationship} value={relationship}>
              {relationshipLabels[relationship]}
            </option>
          ))}
        </select>
        {error?.fieldErrors?.relationship?.[0] ? (
          <p id="child-relationship-error" className="text-sm text-destructive">
            {error.fieldErrors.relationship[0]}
          </p>
        ) : null}
      </div>

      {error && !error.fieldErrors ? (
        <p role="alert" className="text-sm text-destructive">
          {error.error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Dodavanje…" : "Dodaj dete"}
      </Button>
    </form>
  );
}

function Field({
  id,
  label,
  name,
  error,
  type = "text",
  autoComplete,
}: {
  id: string;
  label: string;
  name: string;
  error?: string;
  type?: string;
  autoComplete?: string;
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
