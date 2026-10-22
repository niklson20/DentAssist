"use client";

import { useActionState } from "react";

import { acceptClinicInvite, resendClinicInvite } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";

export function InviteForm({ token }: { token: string }) {
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(acceptClinicInvite, null);
  const [resendResult, resendAction, resendPending] = useActionState<
    ActionResult<{ sent: true }> | null,
    FormData
  >(resendClinicInvite, null);
  const error = result && !result.ok ? result : null;
  const clinicNameError = error?.fieldErrors?.clinicName?.[0];
  const firstNameError = error?.fieldErrors?.firstName?.[0];
  const lastNameError = error?.fieldErrors?.lastName?.[0];
  const codeError = error?.fieldErrors?.code?.[0];
  const passwordError = error?.fieldErrors?.password?.[0];
  const banner =
    error && !clinicNameError && !firstNameError && !lastNameError && !codeError && !passwordError
      ? error.error
      : null;
  const resendError = resendResult && !resendResult.ok ? resendResult : null;
  const busy = pending || resendPending;

  return (
    <section className="w-full max-w-sm rounded-lg border border-border bg-card p-6 text-card-foreground shadow-xs">
      <h1 className="text-xl font-semibold">Otvorite ordinaciju</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Potvrdite kod iz mejla i postavite lozinku. Link važi 7 dana.
      </p>

      <form action={formAction} className="mt-6 flex flex-col gap-4" noValidate>
        <input type="hidden" name="token" value={token} />

        <Field
          id="clinic-name"
          name="clinicName"
          label="Naziv ordinacije"
          autoComplete="organization"
          error={clinicNameError}
          maxLength={120}
        />
        <Field id="first-name" name="firstName" label="Ime" autoComplete="given-name" error={firstNameError} maxLength={80} />
        <Field id="last-name" name="lastName" label="Prezime" autoComplete="family-name" error={lastNameError} maxLength={80} />
        <Field
          id="code"
          name="code"
          label="Kod"
          inputMode="numeric"
          autoComplete="one-time-code"
          error={codeError}
          maxLength={6}
        />
        <Field
          id="password"
          name="password"
          label="Lozinka"
          type="password"
          autoComplete="new-password"
          error={passwordError}
        />

        {banner ? (
          <p role="alert" className="text-sm text-destructive">
            {banner}
          </p>
        ) : null}

        <Button type="submit" disabled={busy}>
          {pending ? "Otvaranje u toku…" : "Otvori ordinaciju"}
        </Button>
      </form>

      <form action={resendAction} className="mt-4 flex flex-col gap-3">
        <input type="hidden" name="token" value={token} />
        <p className="text-sm text-muted-foreground">Kod može da se pošalje ponovo najviše tri puta na sat.</p>
        {resendResult?.ok ? (
          <p role="status" className="text-sm">
            Poslali smo novi kod.
          </p>
        ) : null}
        {resendError ? (
          <p role="alert" className="text-sm text-destructive">
            {resendError.error}
          </p>
        ) : null}
        <Button type="submit" variant="outline" disabled={busy}>
          {resendPending ? "Slanje u toku…" : "Pošalji kod ponovo"}
        </Button>
      </form>
    </section>
  );
}

function Field({
  id,
  name,
  label,
  error,
  type = "text",
  autoComplete,
  inputMode,
  maxLength,
}: {
  id: string;
  name: string;
  label: string;
  error?: string;
  type?: string;
  autoComplete?: string;
  inputMode?: "numeric";
  maxLength?: number;
}) {
  const errorId = `${id}-error`;
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
        inputMode={inputMode}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
