"use client";

import Link from "next/link";
import Script from "next/script";
import { useActionState } from "react";

import {
  confirmPatientEmail,
  registerPatient,
  resendPatientEmailCode,
} from "@/app/actions/patient-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";

type RegisterFormProps = {
  slug?: string;
  clinicName?: string;
  mode: "details" | "code";
  email?: string;
  stomatolog?: string;
  pocetak?: string;
  loginHref: string;
  clinicHref?: string;
  turnstileSiteKey: string | null;
};

export function RegisterForm({
  slug,
  clinicName,
  mode,
  email,
  stomatolog,
  pocetak,
  loginHref,
  clinicHref,
  turnstileSiteKey,
}: RegisterFormProps) {
  const [registered, registerAction, registerPending] = useActionState<
    ActionResult<{ step: "code" }> | null,
    FormData
  >(registerPatient, null);
  const showCode = mode === "code" || registered?.ok === true;

  return (
    <section className="w-full max-w-sm rounded-lg border border-border bg-card p-6 text-card-foreground shadow-xs">
      {showCode ? (
        <CodeStep
          slug={slug}
          email={email}
          stomatolog={stomatolog}
          pocetak={pocetak}
          clinicHref={clinicHref}
          turnstileSiteKey={turnstileSiteKey}
        />
      ) : (
        <DetailsStep
          slug={slug}
          clinicName={clinicName}
          stomatolog={stomatolog}
          pocetak={pocetak}
          loginHref={loginHref}
          clinicHref={clinicHref}
          turnstileSiteKey={turnstileSiteKey}
          result={registered}
          action={registerAction}
          pending={registerPending}
        />
      )}
    </section>
  );
}

function DetailsStep({
  slug,
  clinicName,
  stomatolog,
  pocetak,
  loginHref,
  clinicHref,
  turnstileSiteKey,
  result,
  action,
  pending,
}: {
  slug?: string;
  clinicName?: string;
  stomatolog?: string;
  pocetak?: string;
  loginHref: string;
  clinicHref?: string;
  turnstileSiteKey: string | null;
  result: ActionResult<{ step: "code" }> | null;
  action: (formData: FormData) => void;
  pending: boolean;
}) {
  const error = result && !result.ok ? result : null;
  const firstNameError = error?.fieldErrors?.firstName?.[0];
  const lastNameError = error?.fieldErrors?.lastName?.[0];
  const emailError = error?.fieldErrors?.email?.[0];
  const passwordError = error?.fieldErrors?.password?.[0];
  const turnstileError = error?.fieldErrors?.turnstile?.[0];

  return (
    <>
      {turnstileError && turnstileSiteKey ? (
        <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="lazyOnload" />
      ) : null}
      <h1 className="text-xl font-semibold">Registracija</h1>
      {clinicName ? (
        <p className="mt-1 text-sm text-muted-foreground">
          Otvorite nalog pacijenta za ordinaciju {clinicName}. Mejl se potvrđuje kodom.
        </p>
      ) : null}

      <form action={action} className="mt-6 flex flex-col gap-4" noValidate>
        <ReturnFields slug={slug} stomatolog={stomatolog} pocetak={pocetak} />
        <NameField id="patient-first-name" name="firstName" label="Ime" autoComplete="given-name" error={firstNameError} />
        <NameField id="patient-last-name" name="lastName" label="Prezime" autoComplete="family-name" error={lastNameError} />
        <NameField id="patient-register-email" name="email" label="Mejl" type="email" autoComplete="email" error={emailError} />
        <NameField
          id="patient-register-password"
          name="password"
          label="Lozinka"
          type="password"
          autoComplete="new-password"
          error={passwordError}
        />
        <TurnstileField siteKey={turnstileSiteKey} error={turnstileError} describedBy="patient-register-turnstile-error" />
        {error && !error.fieldErrors ? (
          <p role="alert" className="text-sm text-destructive">
            {error.error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Registracija u toku…" : "Registruj se"}
        </Button>
      </form>

      <p className="mt-4 text-sm">
        Već imate nalog?{" "}
        <Link href={loginHref} className="text-primary underline-offset-4 hover:underline">
          Prijava
        </Link>
      </p>
      <ClinicLink href={clinicHref} />
    </>
  );
}

function CodeStep({
  slug,
  email,
  stomatolog,
  pocetak,
  clinicHref,
  turnstileSiteKey,
}: {
  slug?: string;
  email?: string;
  stomatolog?: string;
  pocetak?: string;
  clinicHref?: string;
  turnstileSiteKey: string | null;
}) {
  const [confirmed, confirmAction, confirmPending] = useActionState<ActionResult | null, FormData>(
    confirmPatientEmail,
    null,
  );
  const [resent, resendAction, resendPending] = useActionState<ActionResult<{ step: "code" }> | null, FormData>(
    resendPatientEmailCode,
    null,
  );
  const confirmError = confirmed && !confirmed.ok ? confirmed : null;
  const codeError = confirmError?.fieldErrors?.code?.[0];
  const resendError = resent && !resent.ok ? resent : null;
  const turnstileError = resendError?.fieldErrors?.turnstile?.[0];

  return (
    <>
      {turnstileError && turnstileSiteKey ? (
        <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="lazyOnload" />
      ) : null}
      <h1 className="text-xl font-semibold">Potvrdite mejl</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {email
          ? `Unesite kod od 6 cifara poslat na ${email}. Važi 10 minuta.`
          : "Unesite kod od 6 cifara iz mejla. Važi 10 minuta."}
      </p>

      <form action={confirmAction} className="mt-6 flex flex-col gap-4" noValidate>
        <ReturnFields slug={slug} stomatolog={stomatolog} pocetak={pocetak} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="patient-code" className="text-sm font-medium">
            Kod
          </label>
          <Input
            id="patient-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            aria-invalid={codeError ? true : undefined}
            aria-describedby={codeError ? "patient-code-error" : undefined}
          />
          {codeError ? (
            <p id="patient-code-error" className="text-sm text-destructive">
              {codeError}
            </p>
          ) : null}
        </div>
        {confirmError && !codeError ? (
          <p role="alert" className="text-sm text-destructive">
            {confirmError.error}
          </p>
        ) : null}
        <Button type="submit" disabled={confirmPending}>
          {confirmPending ? "Provera koda…" : "Potvrdi"}
        </Button>
      </form>

      <form action={resendAction} className="mt-4 flex flex-col gap-4">
        <ReturnFields slug={slug} stomatolog={stomatolog} pocetak={pocetak} />
        <TurnstileField siteKey={turnstileSiteKey} error={turnstileError} describedBy="patient-resend-turnstile-error" />
        {resent?.ok ? (
          <p role="status" className="text-sm">
            Poslali smo novi kod.
          </p>
        ) : null}
        {resendError && !turnstileError ? (
          <p role="alert" className="text-sm text-destructive">
            {resendError.error}
          </p>
        ) : null}
        <Button type="submit" variant="outline" disabled={resendPending}>
          {resendPending ? "Slanje koda…" : "Pošalji kod ponovo"}
        </Button>
      </form>

      <ClinicLink href={clinicHref} />
    </>
  );
}

function ReturnFields({
  slug,
  stomatolog,
  pocetak,
}: {
  slug?: string;
  stomatolog?: string;
  pocetak?: string;
}) {
  return (
    <>
      {slug ? <input type="hidden" name="slug" value={slug} /> : null}
      {stomatolog ? <input type="hidden" name="stomatolog" value={stomatolog} /> : null}
      {pocetak ? <input type="hidden" name="pocetak" value={pocetak} /> : null}
    </>
  );
}

function NameField({
  id,
  name,
  label,
  error,
  type = "text",
  autoComplete,
}: {
  id: string;
  name: string;
  label: string;
  error?: string;
  type?: "text" | "email" | "password";
  autoComplete: string;
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

function TurnstileField({
  siteKey,
  error,
  describedBy,
}: {
  siteKey: string | null;
  error?: string;
  describedBy: string;
}) {
  if (!error) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1.5">
      {siteKey ? (
        <div className="cf-turnstile" data-sitekey={siteKey} aria-describedby={describedBy} />
      ) : null}
      <p id={describedBy} className="text-sm text-destructive">
        {error}
      </p>
    </div>
  );
}

function ClinicLink({ href }: { href?: string }) {
  if (!href) {
    return null;
  }
  return (
    <p className="mt-2 text-sm">
      <Link href={href} className="text-primary underline-offset-4 hover:underline">
        Nazad na ordinaciju
      </Link>
    </p>
  );
}
