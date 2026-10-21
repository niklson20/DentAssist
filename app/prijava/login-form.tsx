"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { signIn } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";

export function LoginForm() {
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(signIn, null);
  const [email, setEmail] = useState("");

  const error = result && !result.ok ? result : null;
  const emailError = error?.fieldErrors?.email?.[0];
  const passwordError = error?.fieldErrors?.password?.[0];

  return (
    <section className="w-full max-w-sm rounded-lg border border-border bg-card p-6 text-card-foreground shadow-xs">
      <h1 className="text-xl font-semibold">Prijava</h1>
      <p className="mt-1 text-sm text-muted-foreground">Prijavite se nalogom osoblja ordinacije.</p>

      <form action={formAction} className="mt-6 flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            Mejl
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? "email-error" : undefined}
          />
          {emailError ? (
            <p id="email-error" className="text-sm text-destructive">
              {emailError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium">
            Lozinka
          </label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={passwordError ? true : undefined}
            aria-describedby={passwordError ? "password-error" : undefined}
          />
          {passwordError ? (
            <p id="password-error" className="text-sm text-destructive">
              {passwordError}
            </p>
          ) : null}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="remember"
            className="size-4 rounded border-input accent-primary"
          />
          Zapamti me
        </label>

        {error && !error.fieldErrors ? (
          <p role="alert" className="text-sm text-destructive">
            {error.error}
          </p>
        ) : null}

        <Button type="submit" disabled={pending}>
          {pending ? "Prijava u toku…" : "Prijavi se"}
        </Button>
      </form>

      <p className="mt-6 text-sm text-muted-foreground">
        Ordinacija još nema nalog?{" "}
        <Link href="/za-ordinacije" className="text-primary underline-offset-4 hover:underline">
          Zatražite pristup
        </Link>
      </p>
    </section>
  );
}
