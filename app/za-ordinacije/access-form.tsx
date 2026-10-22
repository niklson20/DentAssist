"use client";

import Link from "next/link";
import Script from "next/script";
import { useActionState } from "react";

import { requestClinicAccess } from "@/app/actions/platform";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";

type Props = {
  turnstileRequired: boolean;
  turnstileSiteKey: string | null;
};

export function AccessRequestForm({ turnstileRequired, turnstileSiteKey }: Props) {
  const [result, formAction, pending] = useActionState<
    ActionResult<{ submitted: true }> | null,
    FormData
  >(requestClinicAccess, null);

  const error = result && !result.ok ? result : null;
  const emailError = error?.fieldErrors?.email?.[0];
  const cityError = error?.fieldErrors?.city?.[0];
  const turnstileError = error?.fieldErrors?.turnstile?.[0];

  if (result?.ok) {
    return (
      <section className="w-full max-w-sm rounded-lg border border-border bg-card p-6 text-card-foreground shadow-xs">
        <h1 className="text-xl font-semibold">Zahtev je primljen</h1>
        <p className="mt-3 text-sm" role="status">
          Kad ga odobrimo, stiže mejl sa linkom.
        </p>
      </section>
    );
  }

  const showTurnstile = turnstileRequired && Boolean(turnstileSiteKey);

  return (
    <section className="w-full max-w-sm rounded-lg border border-border bg-card p-6 text-card-foreground shadow-xs">
      {showTurnstile ? (
        <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="lazyOnload" />
      ) : null}

      <h1 className="text-xl font-semibold">Za ordinacije</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Ostavite mejl i grad. Kad odobrimo zahtev, šaljemo link za otvaranje ordinacije.
      </p>

      <form action={formAction} className="mt-6 flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="access-email" className="text-sm font-medium">
            Mejl
          </label>
          <Input
            id="access-email"
            name="email"
            type="email"
            autoComplete="email"
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? "access-email-error" : undefined}
          />
          {emailError ? (
            <p id="access-email-error" className="text-sm text-destructive">
              {emailError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="access-city" className="text-sm font-medium">
            Grad
          </label>
          <Input
            id="access-city"
            name="city"
            type="text"
            autoComplete="address-level2"
            aria-invalid={cityError ? true : undefined}
            aria-describedby={cityError ? "access-city-error" : undefined}
          />
          {cityError ? (
            <p id="access-city-error" className="text-sm text-destructive">
              {cityError}
            </p>
          ) : null}
        </div>

        {showTurnstile ? (
          <div className="flex flex-col gap-1.5">
            <div
              className="cf-turnstile"
              data-sitekey={turnstileSiteKey}
              aria-describedby={turnstileError ? "access-turnstile-error" : undefined}
            />
            {turnstileError ? (
              <p id="access-turnstile-error" className="text-sm text-destructive">
                {turnstileError}
              </p>
            ) : null}
          </div>
        ) : null}

        {error && !error.fieldErrors ? (
          <p role="alert" className="text-sm text-destructive">
            {error.error}
          </p>
        ) : null}

        <Button type="submit" disabled={pending}>
          {pending ? "Slanje u toku…" : "Zatražite pristup"}
        </Button>
      </form>

      <p className="mt-6 text-sm text-muted-foreground">
        Već imate nalog?{" "}
        <Link href="/prijava" className="text-primary underline-offset-4 hover:underline">
          Prijavite se
        </Link>
      </p>
    </section>
  );
}
