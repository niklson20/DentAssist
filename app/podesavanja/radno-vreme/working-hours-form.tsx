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
  "h-9 w-[8.5rem] shrink-0 rounded-md border border-input bg-transparent px-2.5 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30";

function dayHasBreak(day: DayScheduleView): boolean {
  return day.breakStartsAt.length > 0 && day.breakEndsAt.length > 0;
}

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
  const [breakByDay, setBreakByDay] = useState(() =>
    Object.fromEntries(days.map((day) => [day.isoDow, dayHasBreak(day)])),
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

      <section className="rounded-lg border border-border bg-card p-4 text-card-foreground">
        <form action={formAction} className="flex flex-col gap-4" noValidate>
          <input type="hidden" name="memberId" value={selectedMemberId} />

          <ul className="divide-y divide-border">
            {days.map((day) => (
              <DayRow
                key={day.isoDow}
                day={day}
                closed={closedByDay[day.isoDow] ?? day.isClosed}
                onClosedChange={(isClosed) =>
                  setClosedByDay((current) => ({
                    ...current,
                    [day.isoDow]: isClosed,
                  }))
                }
                hasBreak={breakByDay[day.isoDow] ?? dayHasBreak(day)}
                onBreakChange={(hasBreak) =>
                  setBreakByDay((current) => ({
                    ...current,
                    [day.isoDow]: hasBreak,
                  }))
                }
                fieldErrors={error?.fieldErrors}
              />
            ))}
          </ul>

          <Button type="submit" disabled={pending} className="self-start">
            {pending ? "Čuvanje…" : "Sačuvaj radno vreme"}
          </Button>

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
        </form>
      </section>
    </div>
  );
}

function DayRow({
  day,
  closed,
  onClosedChange,
  hasBreak,
  onBreakChange,
  fieldErrors,
}: {
  day: DayScheduleView;
  closed: boolean;
  onClosedChange: (closed: boolean) => void;
  hasBreak: boolean;
  onBreakChange: (hasBreak: boolean) => void;
  fieldErrors?: Record<string, string[] | undefined>;
}) {
  const weekendSeparator = day.isoDow === 6;

  return (
    <li className={`py-4 first:pt-0 ${weekendSeparator ? "!pt-6" : ""}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex items-start justify-between gap-3 sm:contents">
          <span className="text-sm font-medium sm:w-28 sm:shrink-0">{ISO_DOW_LABELS[day.isoDow]}</span>
          <div className="flex flex-col items-start gap-2 sm:order-3 sm:ml-auto sm:shrink-0">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name={`closed_${day.isoDow}`}
                value="true"
                checked={closed}
                onChange={(event) => onClosedChange(event.target.checked)}
                className="size-4 rounded border-input accent-primary"
              />
              Zatvoreno
            </label>
            {!closed ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={hasBreak}
                  onChange={(event) => onBreakChange(event.target.checked)}
                  className="size-4 rounded border-input accent-primary"
                />
                Pauza
              </label>
            ) : null}
          </div>
        </div>

        {!closed ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-6 gap-y-3 sm:order-2">
            <div className="flex flex-col gap-2">
              <TimeField
                label="Početak"
                name={`opens_${day.isoDow}`}
                value={day.opensAt}
                hideLabel
                error={fieldErrors?.[`opens_${day.isoDow}`]?.[0]}
              />
              <TimeField
                label="Kraj"
                name={`closes_${day.isoDow}`}
                value={day.closesAt}
                hideLabel
                error={fieldErrors?.[`closes_${day.isoDow}`]?.[0]}
              />
            </div>
            {hasBreak ? (
              <div className="flex flex-col gap-2">
                <TimeField
                  label="Pauza od"
                  name={`breakStart_${day.isoDow}`}
                  value={day.breakStartsAt}
                  labelClassName="w-[4.75rem]"
                  error={fieldErrors?.[`breakStart_${day.isoDow}`]?.[0]}
                />
                <TimeField
                  label="Pauza do"
                  name={`breakEnd_${day.isoDow}`}
                  value={day.breakEndsAt}
                  labelClassName="w-[4.75rem]"
                  error={fieldErrors?.[`breakEnd_${day.isoDow}`]?.[0]}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function TimeField({
  label,
  name,
  value,
  error,
  hideLabel = false,
  labelClassName = "",
}: {
  label: string;
  name: string;
  value: string;
  error?: string;
  hideLabel?: boolean;
  labelClassName?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <label
          htmlFor={name}
          className={
            hideLabel
              ? "sr-only"
              : `shrink-0 whitespace-nowrap text-sm text-muted-foreground ${labelClassName}`
          }
        >
          {label}
        </label>
        <Input
          id={name}
          name={name}
          type="time"
          defaultValue={value}
          className={timeInputClass}
          aria-invalid={error ? true : undefined}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
