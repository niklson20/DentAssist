"use client";

import { useActionState } from "react";

import { signOutPatient } from "@/app/actions/patient-auth";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";

export function PatientSignOutButton({ slug }: { slug?: string }) {
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(signOutPatient, null);
  const signOutError = result && !result.ok ? result.error : null;

  return (
    <form action={formAction} className="flex shrink-0 flex-col items-end gap-1">
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Odjava…" : "Odjava"}
      </Button>
      {slug ? <input type="hidden" name="slug" value={slug} /> : null}
      {signOutError ? (
        <p role="alert" className="max-w-48 text-right text-xs text-destructive">
          {signOutError}
        </p>
      ) : null}
    </form>
  );
}
