"use client";

import { useActionState, useId } from "react";

import { acceptRequest, rejectRequest } from "@/app/actions/appointments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";

export type PendingRequestView = {
  id: string;
  timeLabel: string;
  name: string;
  dentistName: string;
  reason: string;
  deadlineLabel: string;
  needsChoice: boolean;
};

type StaffRole = "owner" | "dentist" | "reception";

type AcceptPayload = { id: string } | { chartChoice: true };

export function PendingColumn({
  role,
  requests,
  error = null,
}: {
  role: StaffRole;
  requests: PendingRequestView[];
  error?: string | null;
}) {
  const canRespond = role === "owner" || role === "dentist";

  return (
    <aside
      aria-label="Zahtevi na čekanju"
      className="w-full rounded-lg border border-border bg-card p-3 text-card-foreground"
    >
      <h2 className="text-sm font-semibold text-foreground">Na čekanju</h2>
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      {requests.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nema zahteva.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {requests.map((request) => (
            <RequestCard key={request.id} request={request} canRespond={canRespond} />
          ))}
        </ul>
      )}
    </aside>
  );
}

function RequestCard({ request, canRespond }: { request: PendingRequestView; canRespond: boolean }) {
  const [acceptState, acceptAction, acceptPending] = useActionState<ActionResult<AcceptPayload> | null, FormData>(
    acceptRequest,
    null,
  );
  const [rejectState, rejectAction, rejectPending] = useActionState<ActionResult<{ id: string }> | null, FormData>(
    rejectRequest,
    null,
  );
  const choosing =
    request.needsChoice || (acceptState?.ok === true && "chartChoice" in acceptState.data);
  const finished =
    (acceptState?.ok === true && "id" in acceptState.data) || rejectState?.ok === true;
  const acceptError = acceptState && !acceptState.ok ? acceptState.error : null;
  const rejectError = rejectState && !rejectState.ok ? rejectState.error : null;
  const messageError = rejectState && !rejectState.ok ? rejectState.fieldErrors?.poruka?.[0] : undefined;
  const messageId = useId();

  return (
    <li className="flex flex-col gap-2 rounded-md border border-border bg-background px-3 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-medium text-foreground">{request.name}</p>
        <p className="shrink-0 text-sm tabular-nums text-muted-foreground">{request.timeLabel}</p>
      </div>
      <dl className="grid grid-cols-[5.75rem_minmax(0,1fr)] gap-x-2 text-sm">
        <dt className="text-muted-foreground">Stomatolog</dt>
        <dd className="truncate text-foreground">{request.dentistName}</dd>
        <dt className="text-muted-foreground">Razlog</dt>
        <dd className="truncate text-foreground">{request.reason}</dd>
        <dt className="text-muted-foreground">Odgovor do</dt>
        <dd className="text-foreground">{request.deadlineLabel}</dd>
      </dl>
      {canRespond && !finished ? (
        <div className="flex flex-wrap items-center gap-2">
          {choosing ? (
            <div className="flex w-full flex-wrap gap-2">
              <form action={acceptAction}>
                <input type="hidden" name="zahtev" value={request.id} />
                <input type="hidden" name="odluka" value="isti" />
                <Button type="submit" size="sm" disabled={acceptPending}>
                  Isti karton
                </Button>
              </form>
              <form action={acceptAction}>
                <input type="hidden" name="zahtev" value={request.id} />
                <input type="hidden" name="odluka" value="drugi" />
                <Button type="submit" size="sm" variant="outline" disabled={acceptPending}>
                  Drugi pacijent
                </Button>
              </form>
            </div>
          ) : (
            <form action={acceptAction}>
              <input type="hidden" name="zahtev" value={request.id} />
              <input type="hidden" name="odluka" value="prihvati" />
              <Button type="submit" size="sm" disabled={acceptPending}>
                Prihvati
              </Button>
            </form>
          )}
          <form action={rejectAction} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <input type="hidden" name="zahtev" value={request.id} />
            <label className="sr-only" htmlFor={messageId}>
              Poruka pacijentu
            </label>
            <Input
              id={messageId}
              name="poruka"
              maxLength={300}
              placeholder="Poruka pacijentu"
              aria-invalid={messageError ? true : undefined}
              className="h-8 min-w-36 flex-1"
            />
            {messageError ? <p className="w-full text-sm text-destructive">{messageError}</p> : null}
            <Button type="submit" size="sm" variant="outline" disabled={rejectPending}>
              Odbij
            </Button>
          </form>
          {acceptError ? (
            <p role="alert" className="text-sm text-destructive">
              {acceptError}
            </p>
          ) : null}
          {rejectError && !messageError ? (
            <p role="alert" className="text-sm text-destructive">
              {rejectError}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
