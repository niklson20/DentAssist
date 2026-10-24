"use client";

import { useActionState } from "react";

import { signOutStaff } from "@/app/danas/actions";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";

export function SignOutButton() {
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(signOutStaff, null);
  const signOutError = result && !result.ok ? result.error : null;

  return (
    <form action={formAction} className="shrink-0">
      {signOutError ? (
        <p role="alert" className="mb-2 text-sm text-destructive">
          {signOutError}
        </p>
      ) : null}
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Odjava…" : "Odjava"}
      </Button>
    </form>
  );
}
