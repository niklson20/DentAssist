"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";

import { saveWorkingHours } from "./actions";
import type { ScheduleDentist } from "./load-working-hours";
import { ISO_DOW_LABELS, type DayScheduleView } from "./schema";

const timeInputClass =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30";

export function WorkingHoursForm({
  canPickDentist,
  dentists,
  selectedMemberId,
  days,
}: {
  canPickDentist: boolean;
  dentists: ScheduleDentist[];
  selectedMemberId: string;
  days: DayScheduleView[];
}) {
  const [result, formAction, pending] = useActionState<ActionResult<{ saved: true }> | null, FormData>(
    saveWorkingHours,
    null,
  );
  const [closedByDay, setClosedByDay] = useState(() =>
    Object.fromEntries(days.map((day) => [day.isoDow, day.isClosed])),
  );
  const error = result && !result.ok ? result : null;

  return (
    <div className="flex flex-col gap-6">
      {canPickDentist ? (
        <nav aria-label="Stomatolozi" className="flex flex-wrap gap-2">
          {dentists.map((dentist) => {
            const active = dentist.id === selectedMemberId;
            const label = `${dentist.firstName} ${dentist.lastName}`;
            return (
              <Link
                key={dentist.id}
                href={`/podesavanja/radno-vreme?stomatolog=${dentist.id}`}
                className={
                  active
                    ? "rounded-md border border-primary bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary"
                    : "rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground"
                }
                aria-current={active ? "page" : undefined}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      ) : null}

      <form action={formAction} className="flex flex-col gap-6" noValidate>
        <input type="hidden" name="memberId" value={selectedMemberId} />

        {result?.ok ? (
          <p className="text-sm" role="status">
            Radno vreme je sačuvano.
          </p>
        ) : null}

        {error?.error && !error.fieldErrors ? (
          <p className="text-sm text-destructive" role="alert">
            {error.error}
          </p>
        ) : null}

        <ul className="flex flex-col gap-4">
          {days.map((day) => {
            const closed = closedByDay[day.isoDow] ?? day.isClosed;
            return (
              <li
                key={day.isoDow}
                className="rounded-lg border border-border p-4 flex flex-col gap-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">{ISO_DOW_LABELS[day.isoDow]}</span>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name={`closed_${day.isoDow}`}
                      value="true"
                      checked={closed}
                      onChange={(event) =>
                        setClosedByDay((current) => ({
                          ...current,
                          [day.isoDow]: event.target.checked,
                        }))
                      }
                      className="size-4 rounded border-input accent-primary"
                    />
                    Zatvoreno
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <TimeField
                    label="Početak"
                    name={`opens_${day.isoDow}`}
                    value={day.opensAt}
                    disabled={closed}
                    error={error?.fieldErrors?.[`opens_${day.isoDow}`]?.[0]}
                  />
                  <TimeField
                    label="Kraj"
                    name={`closes_${day.isoDow}`}
                    value={day.closesAt}
                    disabled={closed}
                    error={error?.fieldErrors?.[`closes_${day.isoDow}`]?.[0]}
                  />
                  <TimeField
                    label="Pauza od"
                    name={`breakStart_${day.isoDow}`}
                    value={day.breakStartsAt}
                    disabled={closed}
                    error={error?.fieldErrors?.[`breakStart_${day.isoDow}`]?.[0]}
                  />
                  <TimeField
                    label="Pauza do"
                    name={`breakEnd_${day.isoDow}`}
                    value={day.breakEndsAt}
                    disabled={closed}
                    error={error?.fieldErrors?.[`breakEnd_${day.isoDow}`]?.[0]}
                  />
                </div>
              </li>
            );
          })}
        </ul>

        <Button type="submit" disabled={pending}>
          {pending ? "Čuvanje…" : "Sačuvaj radno vreme"}
        </Button>
      </form>
    </div>
  );
}

function TimeField({
  label,
  name,
  value,
  disabled,
  error,
}: {
  label: string;
  name: string;
  value: string;
  disabled: boolean;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm text-muted-foreground">
        {label}
      </label>
      <Input
        id={name}
        name={name}
        type="time"
        defaultValue={value}
        disabled={disabled}
        className={timeInputClass}
        aria-invalid={error ? true : undefined}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
