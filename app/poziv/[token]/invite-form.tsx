"use client";

import { useActionState } from "react";

import { acceptClinicInvite, acceptStaffInvite, resendClinicInvite, resendStaffInvite } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";

import { InviteCard } from "./invite-card";

type InviteFormProps =
  | { kind: "clinic"; token: string }
  | { kind: "staff"; token: string; clinicName: string; inviterName: string; roleLabel: string };

export function InviteForm(props: InviteFormProps) {
  const accepting = props.kind === "staff" ? acceptStaffInvite : acceptClinicInvite;
  const resending = props.kind === "staff" ? resendStaffInvite : resendClinicInvite;
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(accepting, null);
  const [resendResult, resendAction, resendPending] = useActionState<
    ActionResult<{ sent: true }> | null,
    FormData
  >(resending, null);
  const error = result && !result.ok ? result : null;
  const clinicNameError = props.kind === "clinic" ? error?.fieldErrors?.clinicName?.[0] : undefined;
  const firstNameError = props.kind === "clinic" ? error?.fieldErrors?.firstName?.[0] : undefined;
  const lastNameError = props.kind === "clinic" ? error?.fieldErrors?.lastName?.[0] : undefined;
  const codeError = error?.fieldErrors?.code?.[0];
  const passwordError = error?.fieldErrors?.password?.[0];
  const banner =
    error && !clinicNameError && !firstNameError && !lastNameError && !codeError && !passwordError
      ? error.error
      : null;
  const resendError = resendResult && !resendResult.ok ? resendResult : null;
  const busy = pending || resendPending;
  const title = props.kind === "staff" ? `Poziv u ${props.clinicName}` : "Otvorite ordinaciju";
  const intro =
    props.kind === "staff"
      ? `${props.inviterName} vas poziva kao ${props.roleLabel}. Potvrdite kod iz mejla i postavite lozinku. Link važi 7 dana.`
      : "Potvrdite kod iz mejla i postavite lozinku. Link važi 7 dana.";

  return (
    <InviteCard title={title}>
      <p className="mt-1 text-sm text-muted-foreground">{intro}</p>

      <form action={formAction} className="mt-6 flex flex-col gap-4" noValidate>
        <input type="hidden" name="token" value={props.token} />

        {props.kind === "clinic" ? (
          <>
            <Field
              id="clinic-name"
              name="clinicName"
              label="Naziv ordinacije"
              autoComplete="organization"
              error={clinicNameError}
              maxLength={120}
            />
            <Field
              id="first-name"
              name="firstName"
              label="Ime"
              autoComplete="given-name"
              error={firstNameError}
              maxLength={80}
            />
            <Field
              id="last-name"
              name="lastName"
              label="Prezime"
              autoComplete="family-name"
              error={lastNameError}
              maxLength={80}
            />
          </>
        ) : null}
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
          {pending
            ? props.kind === "staff"
              ? "Prihvatanje u toku…"
              : "Otvaranje u toku…"
            : props.kind === "staff"
              ? "Prihvati poziv"
              : "Otvori ordinaciju"}
        </Button>
      </form>

      <form action={resendAction} className="mt-4 flex flex-col gap-3">
        <input type="hidden" name="token" value={props.token} />
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
    </InviteCard>
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
