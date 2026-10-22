"use client";

import { useActionState } from "react";

import { setNewPassword } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";

export function PasswordForm({ token, clinicSlug }: { token: string; clinicSlug?: string }) {
  const [result, formAction, pending] = useActionState<ActionResult<{ saved: true }> | null, FormData>(
    setNewPassword,
    null,
  );
  const error = result && !result.ok ? result : null;
  const passwordError = error?.fieldErrors?.password?.[0];

  if (result?.ok) {
    return (
      <section className="w-full max-w-sm rounded-lg border border-border bg-card p-6 text-card-foreground shadow-xs">
        <h1 className="text-xl font-semibold">Nova lozinka</h1>
        <p className="mt-4 text-sm" role="status">
          Lozinka je sačuvana.
        </p>
      </section>
    );
  }

  return (
    <section className="w-full max-w-sm rounded-lg border border-border bg-card p-6 text-card-foreground shadow-xs">
      <h1 className="text-xl font-semibold">Nova lozinka</h1>
      <p className="mt-1 text-sm text-muted-foreground">Unesite novu lozinku. Link važi sat vremena.</p>

      <form action={formAction} className="mt-6 flex flex-col gap-4" noValidate>
        <input type="hidden" name="token" value={token} />
        {clinicSlug ? <input type="hidden" name="clinicSlug" value={clinicSlug} /> : null}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium">
            Nova lozinka
          </label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={passwordError ? true : undefined}
            aria-describedby={passwordError ? "password-error" : undefined}
          />
          {passwordError ? (
            <p id="password-error" className="text-sm text-destructive">
              {passwordError}
            </p>
          ) : null}
        </div>

        {error && !passwordError ? (
          <p role="alert" className="text-sm text-destructive">
            {error.error}
          </p>
        ) : null}

        <Button type="submit" disabled={pending}>
          {pending ? "Čuvanje u toku…" : "Sačuvaj lozinku"}
        </Button>
      </form>
    </section>
  );
}
