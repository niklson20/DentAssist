"use client";

import Link from "next/link";
import { useActionState } from "react";

import { showCalendarDay } from "@/app/danas/actions";
import { calendarPath } from "@/app/danas/schema";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";
import {
  addCalendarDays,
  formatBelgrade,
  startOfBelgradeDay,
  type CalendarQuery,
  type CalendarView,
} from "@/lib/calendar-dates";
import { cn } from "@/lib/utils";

const VIEWS: { id: CalendarView; label: string }[] = [
  { id: "dan", label: "Dan" },
  { id: "nedelja", label: "Nedelja" },
  { id: "mesec", label: "Mesec" },
];

export function CalendarShell({ query }: { query: CalendarQuery }) {
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(showCalendarDay, null);
  const dateError = result && !result.ok ? result.fieldErrors?.datum?.[0] : undefined;
  const formError = result && !result.ok && !dateError ? result.error : null;
  const dateLabel = formatBelgrade(startOfBelgradeDay(query.datum), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <main className="flex flex-col gap-6 p-4">
      <header className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Danas</h1>
          <p className="mt-1 text-sm text-muted-foreground">{dateLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={calendarPath(query, { datum: addCalendarDays(query.datum, -1) })}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Prethodni dan
          </Link>
          <Link
            href={calendarPath(query, { datum: addCalendarDays(query.datum, 1) })}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Sledeći dan
          </Link>
        </div>
        <form
          key={`${query.prikaz}:${query.datum}:${query.stomatolog ?? ""}:${query.sakrijOtkazane}`}
          action={formAction}
          className="flex flex-wrap items-end gap-3"
        >
          <input type="hidden" name="prikaz" value={query.prikaz} />
          <input type="hidden" name="stomatolog" value={query.stomatolog ?? ""} />
          <input type="hidden" name="sakrijOtkazane" value={query.sakrijOtkazane ? "da" : "ne"} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="datum" className="text-sm font-medium">
              Datum
            </label>
            <Input
              id="datum"
              name="datum"
              type="date"
              defaultValue={query.datum}
              aria-invalid={dateError ? true : undefined}
              aria-describedby={dateError ? "datum-error" : undefined}
            />
            {dateError ? (
              <p id="datum-error" className="text-sm text-destructive">
                {dateError}
              </p>
            ) : null}
          </div>
          <Button type="submit" disabled={pending}>
            Prikaži
          </Button>
        </form>
        {formError ? (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        ) : null}
        <nav aria-label="Prikaz kalendara" className="flex flex-wrap gap-2">
          {VIEWS.map((view) => {
            const current = query.prikaz === view.id;
            return (
              <Link
                key={view.id}
                href={calendarPath(query, { prikaz: view.id })}
                aria-current={current ? "page" : undefined}
                className={cn(buttonVariants({ variant: current ? "default" : "outline", size: "sm" }))}
              >
                {view.label}
              </Link>
            );
          })}
        </nav>
        <Link
          href={calendarPath(query, { sakrijOtkazane: !query.sakrijOtkazane })}
          className={cn(buttonVariants({ variant: query.sakrijOtkazane ? "secondary" : "outline", size: "sm" }))}
        >
          {query.sakrijOtkazane ? "Prikaži otkazane" : "Sakrij otkazane"}
        </Link>
        <p role="status" className="text-sm text-muted-foreground">
          {query.sakrijOtkazane ? "Otkazani termini su sakriveni." : "Otkazani termini su vidljivi."}
        </p>
      </header>
      <section aria-label="Kalendar" className="min-h-64 rounded-lg border border-border bg-card" />
    </main>
  );
}
