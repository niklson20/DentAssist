"use client";

import { useActionState, useId } from "react";

import { acceptRequest, rejectRequest } from "@/app/actions/appointments";
import { Button } from "@/components/ui/button";
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

const areaClass =
  "min-h-16 w-full rounded-md border border-input bg-transparent px-2.5 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

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
      aria-label="Čeka potvrdu"
      className="w-full shrink-0 rounded-lg border border-border bg-card p-4 text-card-foreground lg:w-80"
    >
      <h2 className="text-lg font-semibold text-foreground">Čeka potvrdu</h2>
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
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
      <p className="text-sm font-medium text-foreground">{request.timeLabel}</p>
      <p className="text-sm text-foreground">{request.name}</p>
      <p className="text-sm text-muted-foreground">{request.dentistName}</p>
      <p className="text-sm text-foreground">{request.reason}</p>
      <p className="text-sm text-muted-foreground">Rok: {request.deadlineLabel}</p>
      {canRespond && !finished ? (
        <div className="flex flex-col gap-2">
          {choosing ? (
            <div className="flex flex-wrap gap-2">
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
          <form action={rejectAction} className="flex flex-col gap-2">
            <input type="hidden" name="zahtev" value={request.id} />
            <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground" htmlFor={messageId}>
              Poruka
              <textarea id={messageId} name="poruka" rows={2} maxLength={300} className={areaClass} />
            </label>
            {messageError ? <p className="text-sm text-destructive">{messageError}</p> : null}
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
