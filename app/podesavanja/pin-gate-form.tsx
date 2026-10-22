"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";

import { unlockSettingsPin } from "./actions";

export function SettingsPinForm({ pinSet }: { pinSet: boolean }) {
  const router = useRouter();
  const [result, formAction, pending] = useActionState<ActionResult<{ unlocked: true }> | null, FormData>(
    unlockSettingsPin,
    null,
  );

  useEffect(() => {
    if (result?.ok) {
      router.refresh();
    }
  }, [result, router]);

  const error = result && !result.ok ? result : null;
  const pinError = error?.fieldErrors?.pin?.[0];

  return (
    <section className="rounded-lg border border-border bg-card p-4 text-card-foreground">
      <h1 className="text-2xl font-semibold">PIN vlasnika</h1>
      {pinSet ? (
        <form action={formAction} className="mt-4 flex flex-col gap-4" noValidate>
          <p className="text-sm text-muted-foreground">Unesite PIN da otvorite podešavanja.</p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="settings-pin" className="text-sm font-medium">
              PIN
            </label>
            <Input
              id="settings-pin"
              name="pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              aria-invalid={pinError ? true : undefined}
              aria-describedby={pinError ? "settings-pin-error" : undefined}
            />
            {pinError ? (
              <p id="settings-pin-error" className="text-sm text-destructive">
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
            {pending ? "Otvaranje u toku…" : "Otvori"}
          </Button>
        </form>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Prvo postavite PIN na stranici{" "}
          <Link href="/podesavanja/nalog" className="underline">
            Nalog
          </Link>
          .
        </p>
      )}
    </section>
  );
}
