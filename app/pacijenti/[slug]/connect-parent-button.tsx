"use client";

import { useActionState } from "react";

import { sendParentLink } from "@/app/actions/patient-account";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";

import type { ParentContactOption } from "./load-child-chart";

type ConnectParentButtonProps = {
  patientSlug: string;
  contacts: ParentContactOption[];
};

export function ConnectParentButton({ patientSlug, contacts }: ConnectParentButtonProps) {
  const [result, formAction, pending] = useActionState<ActionResult<{ sent: true }> | null, FormData>(
    sendParentLink,
    null,
  );
  const error = result && !result.ok ? result : null;
  const onlyContact = contacts.length === 1 ? contacts[0] : null;

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 text-card-foreground" noValidate>
      <h2 className="text-lg font-semibold">Poveži sa roditeljem</h2>
      <p className="text-sm text-muted-foreground">
        Poziv ide na mejl kontakta. Mejl deteta se ne popunjava. Ime deteta roditelj vidi tek posle potvrde.
      </p>
      <input type="hidden" name="patientSlug" value={patientSlug} />

      {result?.ok ? (
        <p className="text-sm" role="status">
          Poziv je poslat.
        </p>
      ) : null}

      {onlyContact ? (
        <>
          <input type="hidden" name="contactId" value={onlyContact.id} />
          <p className="text-sm">{onlyContact.label}</p>
        </>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="parent-contact" className="text-sm font-medium">
            Roditelj
          </label>
          <select
            id="parent-contact"
            name="contactId"
            defaultValue=""
            className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm text-foreground"
            aria-invalid={error?.fieldErrors?.contactId?.[0] ? true : undefined}
            aria-describedby={error?.fieldErrors?.contactId?.[0] ? "parent-contact-error" : undefined}
          >
            <option value="" disabled>
              Izaberite roditelja
            </option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.label}
              </option>
            ))}
          </select>
          {error?.fieldErrors?.contactId?.[0] ? (
            <p id="parent-contact-error" className="text-sm text-destructive">
              {error.fieldErrors.contactId[0]}
            </p>
          ) : null}
        </div>
      )}

      {error && !error.fieldErrors ? (
        <p role="alert" className="text-sm text-destructive">
          {error.error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending || contacts.length === 0}>
        {pending ? "Slanje…" : "Poveži sa roditeljem"}
      </Button>
    </form>
  );
}
