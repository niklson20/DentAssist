"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { requestPasswordReset } from "@/app/actions/auth";
import { signInPatient } from "@/app/actions/patient-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";

type LoginFormProps = {
  slug?: string;
  clinicName?: string;
  stomatolog?: string;
  pocetak?: string;
  registerHref: string;
  clinicHref?: string;
};

export function LoginForm({
  slug,
  clinicName,
  stomatolog,
  pocetak,
  registerHref,
  clinicHref,
}: LoginFormProps) {
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(signInPatient, null);
  const [resetResult, resetAction, resetPending] = useActionState<ActionResult<{ sent: true }> | null, FormData>(
    requestPasswordReset,
    null,
  );
  const [mode, setMode] = useState<"sign-in" | "reset">("sign-in");

  const error = result && !result.ok ? result : null;
  const emailError = error?.fieldErrors?.email?.[0];
  const passwordError = error?.fieldErrors?.password?.[0];
  const resetError = resetResult && !resetResult.ok ? resetResult : null;
  const resetEmailError = resetError?.fieldErrors?.email?.[0];

  return (
    <section className="w-full max-w-sm rounded-lg border border-border bg-card p-6 text-card-foreground shadow-xs">
      <h1 className="text-xl font-semibold">{mode === "reset" ? "Nova lozinka" : "Prijava"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {mode === "reset"
          ? "Poslaćemo link koji važi sat vremena."
          : clinicName
            ? `Prijavite se da nastavite u ordinaciji ${clinicName}.`
            : "Prijavite se da biste zakazali u bilo kojoj ordinaciji."}
      </p>

      {mode === "reset" ? (
        <form action={resetAction} className="mt-6 flex flex-col gap-4" noValidate>
          <input type="hidden" name="audience" value="patient" />
          {slug ? <input type="hidden" name="clinicSlug" value={slug} /> : null}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="reset-email" className="text-sm font-medium">
              Mejl
            </label>
            <Input
              id="reset-email"
              name="email"
              type="email"
              autoComplete="username"
              aria-invalid={resetEmailError ? true : undefined}
              aria-describedby={resetEmailError ? "reset-email-error" : undefined}
            />
            {resetEmailError ? (
              <p id="reset-email-error" className="text-sm text-destructive">
                {resetEmailError}
              </p>
            ) : null}
          </div>

          {resetResult?.ok ? (
            <p role="status" className="text-sm">
              Ako nalog postoji, poslali smo link za novu lozinku.
            </p>
          ) : null}

          {resetError && !resetEmailError ? (
            <p role="alert" className="text-sm text-destructive">
              {resetError.error}
            </p>
          ) : null}

          <Button type="submit" disabled={resetPending}>
            {resetPending ? "Slanje u toku…" : "Pošalji link"}
          </Button>
          <Button type="button" variant="outline" onClick={() => setMode("sign-in")}>
            Nazad na prijavu
          </Button>
        </form>
      ) : null}

      {mode === "sign-in" ? (
        <>
          <form action={formAction} className="mt-6 flex flex-col gap-4" noValidate>
            {slug ? <input type="hidden" name="slug" value={slug} /> : null}
            {stomatolog ? <input type="hidden" name="stomatolog" value={stomatolog} /> : null}
            {pocetak ? <input type="hidden" name="pocetak" value={pocetak} /> : null}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="patient-email" className="text-sm font-medium">
                Mejl
              </label>
              <Input
                id="patient-email"
                name="email"
                type="email"
                autoComplete="username"
                aria-invalid={emailError ? true : undefined}
                aria-describedby={emailError ? "patient-email-error" : undefined}
              />
              {emailError ? (
                <p id="patient-email-error" className="text-sm text-destructive">
                  {emailError}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="patient-password" className="text-sm font-medium">
                Lozinka
              </label>
              <Input
                id="patient-password"
                name="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={passwordError ? true : undefined}
                aria-describedby={passwordError ? "patient-password-error" : undefined}
              />
              {passwordError ? (
                <p id="patient-password-error" className="text-sm text-destructive">
                  {passwordError}
                </p>
              ) : null}
            </div>

            {error && !error.fieldErrors ? (
              <p role="alert" className="text-sm text-destructive">
                {error.error}
              </p>
            ) : null}

            <Button type="submit" disabled={pending}>
              {pending ? "Prijava u toku…" : "Prijavi se"}
            </Button>
          </form>

          <p className="mt-4 text-sm">
            <button
              type="button"
              className="text-primary underline-offset-4 hover:underline"
              onClick={() => setMode("reset")}
            >
              Zaboravljena lozinka
            </button>
          </p>

          <p className="mt-4 text-sm">
            Nemate nalog?{" "}
            <Link href={registerHref} className="text-primary underline-offset-4 hover:underline">
              Registracija
            </Link>
          </p>
          {clinicHref ? (
            <p className="mt-2 text-sm">
              <Link href={clinicHref} className="text-primary underline-offset-4 hover:underline">
                Nazad na ordinaciju
              </Link>
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
