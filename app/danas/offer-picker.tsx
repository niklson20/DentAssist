"use client";

import { useActionState, useState } from "react";

import { sendOffer } from "@/app/actions/appointments";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import { formatBelgrade } from "@/lib/calendar-dates";

const LIMIT = 3;

export function offerSelectionAfterTouch(selected: readonly string[], start: string): string[] {
  const index = selected.indexOf(start);
  if (index >= 0) {
    return selected.filter((item) => item !== start);
  }
  if (selected.length >= LIMIT) {
    return [...selected];
  }
  return [...selected, start];
}

export function OfferPicker({
  requestId,
  requestedStart,
  starts,
  onClose,
  initialSelected = [],
}: {
  requestId: string;
  requestedStart: string | null;
  starts: readonly string[];
  onClose: () => void;
  initialSelected?: readonly string[];
}) {
  const visible = visibleStarts(starts, requestedStart);
  const [selected, setSelected] = useState<string[]>(() =>
    initialSelected
      .filter((start, index) => initialSelected.indexOf(start) === index)
      .filter((start) => visible.some((item) => sameInstant(item, start)))
      .slice(0, LIMIT),
  );
  const [result, formAction, pending] = useActionState<ActionResult<{ id: string }> | null, FormData>(
    sendOffer,
    null,
  );
  const sent = result?.ok === true;
  const formError = result && !result.ok ? (result.fieldErrors?.pocetak?.[0] ?? result.error) : null;

  return (
    <div id="ponuda" className="flex max-w-lg flex-col gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground">
      <h2 className="text-lg font-semibold text-foreground">Ponuda</h2>
      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nema slobodnih termina ovog dana.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((start) => {
            const order = selected.indexOf(start);
            const picked = order >= 0;
            return (
              <li key={start}>
                <button
                  type="button"
                  data-start={start}
                  data-order={picked ? order + 1 : undefined}
                  aria-pressed={picked}
                  onClick={() => setSelected((current) => offerSelectionAfterTouch(current, start))}
                  className="flex w-full items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-left text-sm text-foreground aria-pressed:border-primary aria-pressed:bg-secondary"
                >
                  <span>{offerStartLabel(start)}</span>
                  {picked ? <span className="text-sm font-semibold text-primary">{order + 1}</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {formError ? (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      ) : null}
      {sent ? (
        <p role="status" className="text-sm text-foreground">
          Ponuda je poslata.
        </p>
      ) : null}
      <form action={formAction} className="flex flex-wrap gap-2">
        <input type="hidden" name="zahtev" value={requestId} />
        {selected.map((start) => (
          <input key={start} type="hidden" name="pocetak" value={start} />
        ))}
        <Button type="submit" size="sm" disabled={pending || sent || selected.length === 0}>
          Pošalji ponudu
        </Button>
      </form>
      <Button type="button" size="sm" variant="outline" onClick={onClose}>
        Nazad
      </Button>
    </div>
  );
}

function visibleStarts(starts: readonly string[], requestedStart: string | null): string[] {
  const visible: string[] = [];
  for (const start of starts) {
    if (sameInstant(start, requestedStart)) continue;
    if (visible.some((item) => sameInstant(item, start))) continue;
    visible.push(start);
  }
  return visible;
}

function sameInstant(left: string, right: string | null): boolean {
  if (right === null) return false;
  if (left === right) return true;
  const a = Date.parse(left);
  const b = Date.parse(right);
  return Number.isFinite(a) && a === b;
}

function offerStartLabel(value: string): string {
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return value;
  return formatBelgrade(time, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
