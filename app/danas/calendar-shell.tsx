"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { calendarPath } from "@/app/danas/schema";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  addCalendarDays,
  addCalendarMonths,
  formatBelgrade,
  formatBelgradeDate,
  startOfBelgradeDay,
  type CalendarQuery,
  type CalendarView,
} from "@/lib/calendar-dates";
import { cn } from "@/lib/utils";

import { AppointmentForm, type AppointmentFormChoices } from "./appointment-form";
import { DateJump } from "./date-jump";
import { HideCancelledProvider } from "./hide-cancelled";
import { PhoneBar } from "./phone-bar";

const EMPTY_APPOINTMENT_CHOICES: AppointmentFormChoices = {
  dentists: [],
  patients: [],
  types: [],
  slotMinutes: 15,
};

const VIEWS: { id: CalendarView; label: string }[] = [
  { id: "dan", label: "Dan" },
  { id: "nedelja", label: "Nedelja" },
  { id: "mesec", label: "Mesec" },
];

const STEP_LABEL: Record<CalendarView, { previous: string; next: string }> = {
  dan: { previous: "Prethodni dan", next: "Sledeći dan" },
  nedelja: { previous: "Prethodna nedelja", next: "Sledeća nedelja" },
  mesec: { previous: "Prethodni mesec", next: "Sledeći mesec" },
};

function shiftDatum(query: CalendarQuery, direction: -1 | 1): string {
  if (query.prikaz === "nedelja") {
    return addCalendarDays(query.datum, direction * 7);
  }
  if (query.prikaz === "mesec") {
    return addCalendarMonths(query.datum, direction);
  }
  return addCalendarDays(query.datum, direction);
}

export function CalendarShell({
  query,
  dayCalendar = null,
  weekCalendar = null,
  monthCalendar = null,
  phoneCalendar = null,
  appointmentChoices = EMPTY_APPOINTMENT_CHOICES,
}: {
  query: CalendarQuery;
  dayCalendar?: ReactNode;
  weekCalendar?: ReactNode;
  monthCalendar?: ReactNode;
  phoneCalendar?: ReactNode;
  appointmentChoices?: AppointmentFormChoices;
}) {
  const dateLabel = formatBelgrade(startOfBelgradeDay(query.datum), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const [hidden, setHidden] = useState(query.sakrijOtkazane);
  useEffect(() => {
    setHidden(query.sakrijOtkazane);
  }, [query.sakrijOtkazane]);
  const liveQuery = { ...query, sakrijOtkazane: hidden };

  function toggleHidden(next: boolean) {
    setHidden(next);
    window.history.replaceState(window.history.state, "", calendarPath({ ...query, sakrijOtkazane: next }));
  }

  return (
    <HideCancelledProvider hidden={hidden}>
      <main className="flex min-h-dvh flex-col gap-6 p-4 pb-24 md:hidden">
        <section
          id="phone-calendar-panel"
          aria-label="Kalendar"
          data-hide-cancelled={hidden ? "true" : undefined}
          className="flex flex-col gap-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">Kalendar</h1>
              <p className="mt-1 text-sm text-muted-foreground">{dateLabel}</p>
            </div>
            <HideCancelledToggle checked={hidden} onChange={toggleHidden} />
          </div>
          {phoneCalendar}
        </section>
        <PhoneBar />
      </main>
      <main className="hidden flex-col gap-6 p-4 md:flex">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={calendarPath(liveQuery, { datum: shiftDatum(liveQuery, -1) })}
            aria-label={STEP_LABEL[query.prikaz].previous}
            className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }))}
          >
            <StepArrow direction="previous" />
          </Link>
          <nav aria-label="Prikaz kalendara" className="flex flex-wrap gap-2">
            {VIEWS.map((view) => {
              const current = query.prikaz === view.id;
              return (
                <Link
                  key={view.id}
                  href={calendarPath(liveQuery, { prikaz: view.id })}
                  aria-current={current ? "page" : undefined}
                  className={cn(buttonVariants({ variant: current ? "default" : "outline", size: "sm" }))}
                >
                  {view.label}
                </Link>
              );
            })}
          </nav>
          <Link
            href={calendarPath(liveQuery, { datum: shiftDatum(liveQuery, 1) })}
            aria-label={STEP_LABEL[query.prikaz].next}
            className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }))}
          >
            <StepArrow direction="next" />
          </Link>
        </div>
        <DateJump query={liveQuery} />
        <div className="flex items-center justify-end gap-3">
          <HideCancelledToggle checked={hidden} onChange={toggleHidden} />
          <Dialog>
            <DialogTrigger render={<Button type="button" size="sm" />}>Novi termin</DialogTrigger>
            <DialogContent>
              <div className="flex items-start justify-between gap-3">
                <DialogTitle>Novi termin</DialogTitle>
                <DialogClose render={<Button type="button" variant="outline" size="sm" />}>Zatvori</DialogClose>
              </div>
              <AppointmentForm
                key={query.datum}
                embedded
                choices={appointmentChoices}
                datum={query.datum}
                today={formatBelgradeDate(new Date())}
                defaultDentistId={query.stomatolog}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <section
        aria-label="Kalendar"
        data-hide-cancelled={hidden ? "true" : undefined}
        className="min-h-64 rounded-lg border border-border bg-card"
      >
        {query.prikaz === "dan" ? dayCalendar : query.prikaz === "nedelja" ? weekCalendar : monthCalendar}
      </section>
      </main>
    </HideCancelledProvider>
  );
}

function HideCancelledToggle({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 rounded border-input accent-primary"
      />
      Sakrij otkazane
    </label>
  );
}

function StepArrow({ direction }: { direction: "previous" | "next" }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4">
      <path
        d={direction === "previous" ? "M10 3 5 8l5 5" : "M6 3l5 5-5 5"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
