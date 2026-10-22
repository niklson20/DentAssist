"use client";

import { useActionState } from "react";

import { dismissClinicAccessRequest, sendClinicAccessInvite } from "@/app/actions/platform";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import { formatBelgrade } from "@/lib/calendar-dates";
import type { PendingClinicAccessRequest } from "@/lib/queries/platform";

type Props = {
  requests: PendingClinicAccessRequest[];
};

export function AccessRequestsPanel({ requests }: Props) {
  if (requests.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Nema zahteva na čekanju.</p>
    );
  }

  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {requests.map((request) => (
        <AccessRequestRow key={request.id} request={request} />
      ))}
    </ul>
  );
}

function AccessRequestRow({ request }: { request: PendingClinicAccessRequest }) {
  const [inviteResult, inviteAction, invitePending] = useActionState<
    ActionResult<{ sent: true }> | null,
    FormData
  >(sendClinicAccessInvite, null);
  const [dismissResult, dismissAction, dismissPending] = useActionState<
    ActionResult<{ dismissed: true }> | null,
    FormData
  >(dismissClinicAccessRequest, null);

  const busy = invitePending || dismissPending;
  const error =
    (inviteResult && !inviteResult.ok ? inviteResult.error : null) ??
    (dismissResult && !dismissResult.ok ? dismissResult.error : null);

  const submittedAt = formatBelgrade(request.createdAt, {
    dateStyle: "short",
    timeStyle: "short",
  });

  if (inviteResult?.ok || dismissResult?.ok) {
    return null;
  }

  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <p className="truncate font-medium">{request.email}</p>
        <p className="text-sm text-muted-foreground">
          {request.city}
          <span aria-hidden="true"> · </span>
          <time dateTime={request.createdAt.toISOString()}>{submittedAt}</time>
        </p>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <form action={inviteAction}>
          <input type="hidden" name="requestId" value={request.id} />
          <Button type="submit" size="sm" disabled={busy}>
            {invitePending ? "Slanje…" : "Pošalji pozivnicu"}
          </Button>
        </form>
        <form action={dismissAction}>
          <input type="hidden" name="requestId" value={request.id} />
          <Button type="submit" size="sm" variant="outline" disabled={busy}>
            {dismissPending ? "Odbacivanje…" : "Odbaci"}
          </Button>
        </form>
      </div>
    </li>
  );
}
