"use client";

import Link from "next/link";
import { useActionState, useId } from "react";

import { dismissPatientEmail } from "@/app/actions/patients";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import { needsPatientEmailTask } from "@/lib/calendar-dates";

type PatientEmailTaskProps = {
  patientSlug: string;
  patientName: string;
  hasContact: boolean;
  dateOfBirth: string | null;
  email: string | null;
  emailDeclined: boolean;
  onDate: string;
  showName?: boolean;
};

export function PatientEmailTask({
  patientSlug,
  patientName,
  hasContact,
  dateOfBirth,
  email,
  emailDeclined,
  onDate,
  showName = false,
}: PatientEmailTaskProps) {
  const titleId = useId();
  const [result, formAction, pending] = useActionState<
    ActionResult<{ patientSlug: string }> | null,
    FormData
  >(dismissPatientEmail, null);
  const due = isPatientEmailTaskDue({
    hasContact,
    dateOfBirth,
    email,
    emailDeclined,
    onDate,
  });

  if (!due || result?.ok) {
    return null;
  }

  const message = result && !result.ok ? (result.fieldErrors?.patientSlug?.[0] ?? result.error) : null;

  return (
    <section
      aria-labelledby={titleId}
      className="flex w-full flex-col gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground"
    >
      <h2 id={titleId} className="text-lg font-semibold text-foreground">
        Unesite mejl pacijenta
      </h2>
      {showName ? (
        <Link
          href={`/pacijenti/${patientSlug}`}
          className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
        >
          {patientName}
        </Link>
      ) : null}
      <form action={formAction} className="flex flex-col gap-3" noValidate>
        <input type="hidden" name="patientSlug" value={patientSlug} />
        {message ? (
          <p role="alert" className="text-sm text-destructive">
            {message}
          </p>
        ) : null}
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Čuvanje…" : "Nema mejl"}
        </Button>
      </form>
    </section>
  );
}

function isPatientEmailTaskDue(input: {
  hasContact: boolean;
  dateOfBirth: string | null;
  email: string | null;
  emailDeclined: boolean;
  onDate: string;
}): boolean {
  try {
    return needsPatientEmailTask(input);
  } catch {
    return false;
  }
}
