"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";

import { changeAccountPassword, setAccountPin } from "./actions";
import type { OwnPinState } from "./pin-status";

export function AccountForms({ pin }: { pin: OwnPinState }) {
  return (
    <div className="flex flex-col gap-6">
      <PasswordForm />
      {pin === "unavailable" ? <PinUnavailable /> : <PinForm pinSet={pin === "set"} />}
    </div>
  );
}

function PasswordForm() {
  const [result, formAction, pending] = useActionState<ActionResult<{ saved: true }> | null, FormData>(
    changeAccountPassword,
    null,
  );
  const error = result && !result.ok ? result : null;
  const passwordError = error?.fieldErrors?.password?.[0];

  return (
    <section className="rounded-lg border border-border bg-card p-4 text-card-foreground">
      <h2 className="text-lg font-semibold">Lozinka</h2>
      {result?.ok ? (
        <p className="mt-4 text-sm" role="status">
          Lozinka je sačuvana.
        </p>
      ) : (
        <form action={formAction} className="mt-4 flex flex-col gap-4" noValidate>
          <p className="text-sm text-muted-foreground">Unesite novu lozinku.</p>
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
          <Button type="submit" disabled={pending} className="self-start">
            {pending ? "Čuvanje u toku…" : "Sačuvaj lozinku"}
          </Button>
        </form>
      )}
    </section>
  );
}

function PinForm({ pinSet }: { pinSet: boolean }) {
  const [result, formAction, pending] = useActionState<ActionResult<{ saved: true }> | null, FormData>(
    setAccountPin,
    null,
  );
  const error = result && !result.ok ? result : null;
  const pinError = error?.fieldErrors?.pin?.[0];

  return (
    <section className="rounded-lg border border-border bg-card p-4 text-card-foreground">
      <h2 className="text-lg font-semibold">PIN</h2>
      {pinSet || result?.ok ? (
        <p className="mt-4 text-sm" role="status">
          PIN je sačuvan.
        </p>
      ) : (
        <form action={formAction} className="mt-4 flex flex-col gap-4" noValidate>
          <p className="text-sm text-muted-foreground">Šest cifara. Koristi se na recepcijskom računaru.</p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pin" className="text-sm font-medium">
              PIN
            </label>
            <Input
              id="pin"
              name="pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              aria-invalid={pinError ? true : undefined}
              aria-describedby={pinError ? "pin-error" : undefined}
            />
            {pinError ? (
              <p id="pin-error" className="text-sm text-destructive">
                {pinError}
              </p>
            ) : null}
          </div>
          {error && !pinError ? (
            <p role="alert" className="text-sm text-destructive">
              {error.error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending} className="self-start">
            {pending ? "Čuvanje u toku…" : "Sačuvaj PIN"}
          </Button>
        </form>
      )}
    </section>
  );
}

function PinUnavailable() {
  return (
    <section className="rounded-lg border border-border bg-card p-4 text-card-foreground">
      <h2 className="text-lg font-semibold">PIN</h2>
      <p className="mt-4 text-sm text-destructive" role="alert">
        PIN trenutno nije dostupan. Pokušajte ponovo.
      </p>
    </section>
  );
}
