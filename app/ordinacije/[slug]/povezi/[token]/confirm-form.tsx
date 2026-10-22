"use client";

import Link from "next/link";
import { useActionState } from "react";

import { confirmChildLink } from "@/app/actions/patient-account";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";

import { childLinkScreen } from "./link-screen";
import type { ChildLinkPreview, ConfirmedChild } from "./schema";

type ConfirmChildFormProps = {
  slug: string;
  token: string;
  clinicName: string;
  preview: ChildLinkPreview;
};

export function ConfirmChildForm({ slug, token, clinicName, preview }: ConfirmChildFormProps) {
  const [result, formAction, pending] = useActionState<ActionResult<ConfirmedChild> | null, FormData>(
    confirmChildLink,
    null,
  );
  const screen = childLinkScreen(preview, result);
  const childrenHref = `/ordinacije/${slug}/deca`;

  return (
    <section className="w-full max-w-sm rounded-lg border border-border bg-card p-6 text-card-foreground shadow-xs">
      <h1 className="text-xl font-semibold">Povezivanje sa nalogom</h1>
      <p className="mt-1 text-sm text-muted-foreground">{clinicName}</p>

      {screen.kind === "added" ? (
        <div className="mt-6 flex flex-col gap-4">
          <p role="status">
            Dete je na nalogu: {screen.firstName} {screen.lastName}.
          </p>
          <Link href={childrenHref} className="text-sm text-primary underline-offset-4 hover:underline">
            Deca na nalogu
          </Link>
        </div>
      ) : null}

      {screen.kind === "message" ? (
        <div className="mt-6 flex flex-col gap-4">
          <p>{screen.text}</p>
          <Link href={childrenHref} className="text-sm text-primary underline-offset-4 hover:underline">
            Deca na nalogu
          </Link>
        </div>
      ) : null}

      {screen.kind === "confirm" ? (
        <form action={formAction} className="mt-6 flex flex-col gap-4" noValidate>
          <p className="text-sm">
            Potvrdite vezu kartona deteta sa vašim nalogom. Ime deteta videćete posle potvrde.
          </p>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="token" value={token} />
          {screen.error ? (
            <p role="alert" className="text-sm text-destructive">
              {screen.error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? "Potvrda…" : "Potvrdi"}
          </Button>
        </form>
      ) : null}
    </section>
  );
}
