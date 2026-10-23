"use client";

import { useActionState, type ReactNode } from "react";

import { createBlock } from "@/app/actions/appointments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";
import { formatBelgrade, isIsoDate, startOfBelgradeDay } from "@/lib/calendar-dates";

export function BlockForm({
  datum,
  dentistId,
  dentistLabel = null,
}: {
  datum: string;
  dentistId: string | null;
  dentistLabel?: string | null;
}) {
  const [result, formAction, pending] = useActionState<ActionResult<{ id: string }> | null, FormData>(
    createBlock,
    null,
  );
  const dentist = dentistId ?? "";
  const dayLabel = isIsoDate(datum)
    ? formatBelgrade(startOfBelgradeDay(datum), {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : datum;
  const formError = result && !result.ok ? result.error : null;
  const startError = message(result, "pocetak");
  const endError = message(result, "kraj");
  const reasonError = message(result, "razlog");
  const dentistError = message(result, "stomatolog");

  return (
    <form
      id="nova-blokada"
      action={formAction}
      noValidate
      className="flex max-w-lg flex-col gap-4 rounded-lg border border-border bg-card p-4 text-card-foreground"
    >
      <h2 className="text-lg font-semibold text-foreground">Blokada</h2>
      <input type="hidden" name="stomatolog" value={dentist} />
      <input type="hidden" name="datum" value={datum} />
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium text-foreground">Stomatolog</p>
        {dentistLabel ? <p className="text-sm text-muted-foreground">{dentistLabel}</p> : null}
        {!dentist ? <p className="text-sm text-destructive">Izaberite stomatologa.</p> : null}
        {dentistError ? (
          <p id="block-dentist-error" className="text-sm text-destructive">
            {dentistError}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium text-foreground">Dan</p>
        <p className="text-sm text-muted-foreground">{dayLabel}</p>
      </div>
      <Field id="block-start" label="Početak" message={startError}>
        <Input
          id="block-start"
          name="pocetak"
          type="time"
          defaultValue="09:00"
          required
          aria-invalid={startError ? true : undefined}
          aria-describedby={describedBy("block-start", startError)}
        />
      </Field>
      <Field id="block-end" label="Kraj" message={endError}>
        <Input
          id="block-end"
          name="kraj"
          type="time"
          defaultValue="10:00"
          required
          aria-invalid={endError ? true : undefined}
          aria-describedby={describedBy("block-end", endError)}
        />
      </Field>
      <Field id="block-reason" label="Razlog" message={reasonError}>
        <Input
          id="block-reason"
          name="razlog"
          maxLength={200}
          aria-invalid={reasonError ? true : undefined}
          aria-describedby={describedBy("block-reason", reasonError)}
        />
      </Field>
      {result?.ok ? (
        <p role="status" className="text-sm text-foreground">
          Blokada je sačuvana.
        </p>
      ) : null}
      {formError ? (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      ) : null}
      <Button type="submit" disabled={pending || dentist.length === 0} className="self-start">
        Sačuvaj
      </Button>
    </form>
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
