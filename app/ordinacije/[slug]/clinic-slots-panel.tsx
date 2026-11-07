"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { addCalendarMonths, parseIsoDate } from "@/lib/calendar-dates";

import {
  BOOKING_CALENDAR_WEEKDAYS,
  buildBookingCalendarWeeks,
  formatBookingCalendarDayLabel,
  formatBookingMonthLabel,
} from "./booking-days";
import { fetchAvailableSlots } from "./slots-actions";
import { buildSlotHourGrid, slotCellKey } from "./slot-grid";

type ClinicSlotsPanelProps = {
  slug: string;
  dentistId: string;
  todayIso: string;
  bookingDays: string[];
  initialDay: string;
  initialSlots: string[];
};

export function ClinicSlotsPanel({
  slug,
  dentistId,
  todayIso,
  bookingDays,
  initialDay,
  initialSlots,
}: ClinicSlotsPanelProps) {
  const [selectedDay, setSelectedDay] = useState(initialDay);
  const [calendarMonth, setCalendarMonth] = useState(() => `${initialDay.slice(0, 7)}-01`);
  const [selectedStart, setSelectedStart] = useState<string | null>(null);
  const [slots, setSlots] = useState(initialSlots);
  const [isPending, startTransition] = useTransition();
  const availableDays = new Set(bookingDays);
  const weeks = buildBookingCalendarWeeks(calendarMonth);
  const firstMonth = bookingDays[0]?.slice(0, 7) ?? calendarMonth.slice(0, 7);
  const lastMonth = bookingDays.at(-1)?.slice(0, 7) ?? calendarMonth.slice(0, 7);
  const visibleMonth = calendarMonth.slice(0, 7);
  const canGoPrevious = visibleMonth > firstMonth;
  const canGoNext = visibleMonth < lastMonth;

  useEffect(() => {
    startTransition(async () => {
      const result = await fetchAvailableSlots({ slug, dentistId, day: selectedDay });
      setSlots(result.ok ? result.data.startsAt : []);
    });
  }, [dentistId, selectedDay, slug]);

  const continueHref =
    selectedStart && dentistId
      ? `/ordinacije/${slug}/zakazivanje?stomatolog=${encodeURIComponent(dentistId)}&pocetak=${encodeURIComponent(selectedStart)}`
      : null;

  return (
    <section className="flex flex-1 flex-col gap-4">
      <div className="space-y-2">
        <h2 className="text-sm font-medium">Izaberite dan</h2>
        <div className="rounded-lg border border-border bg-card p-3 text-card-foreground shadow-xs">
          <div className="mb-3 flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Prethodni mjesec"
              disabled={!canGoPrevious}
              onClick={() => setCalendarMonth(addCalendarMonths(calendarMonth, -1))}
            >
              <CaretLeft aria-hidden="true" />
            </Button>
            <h3 aria-live="polite" className="text-sm font-medium capitalize">
              {formatBookingMonthLabel(calendarMonth)}
            </h3>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Sljedeći mjesec"
              disabled={!canGoNext}
              onClick={() => setCalendarMonth(addCalendarMonths(calendarMonth, 1))}
            >
              <CaretRight aria-hidden="true" />
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {BOOKING_CALENDAR_WEEKDAYS.map((weekday) => (
              <span
                key={weekday}
                className="py-1 text-center text-xs font-medium text-muted-foreground"
              >
                {weekday}
              </span>
            ))}
            {weeks.flatMap((week) =>
              week.map((day) => {
                const active = day === selectedDay;
                const inVisibleMonth = day.slice(0, 7) === visibleMonth;
                const selectable = availableDays.has(day);
                return (
                  <Button
                    key={day}
                    type="button"
                    size="sm"
                    variant={active ? "default" : "ghost"}
                    className={cn(
                      "h-9 px-0 tabular-nums",
                      active ? "mx-auto w-[85%]" : "w-full",
                      !active && !inVisibleMonth && "text-muted-foreground/50",
                    )}
                    aria-label={formatBookingCalendarDayLabel(day)}
                    aria-pressed={active}
                    aria-current={day === todayIso ? "date" : undefined}
                    disabled={!selectable || isPending}
                    onClick={() => {
                      if (day !== selectedDay) {
                        setSelectedStart(null);
                        setSelectedDay(day);
                      }
                    }}
                  >
                    {parseIsoDate(day).day}
                  </Button>
                );
              }),
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium">
          Slobodni termini — {formatBookingCalendarDayLabel(selectedDay)}
        </h2>
        {isPending ? (
          <p className="text-sm text-muted-foreground">Učitavanje…</p>
        ) : slots.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nema slobodnih termina ovog dana.</p>
        ) : (
          <SlotHourButtons slots={slots} selectedStart={selectedStart} onSelect={setSelectedStart} />
        )}
      </div>

      <div className="mt-auto border-t pt-4">
        {continueHref ? (
          <Link href={continueHref} className={cn(buttonVariants(), "w-fit")}>
            Nastavi
          </Link>
        ) : (
          <Button className="w-fit" disabled>
            Nastavi
          </Button>
        )}
      </div>
    </section>
  );
}

function SlotHourButtons({
  slots,
  selectedStart,
  onSelect,
}: {
  slots: string[];
  selectedStart: string | null;
  onSelect: (startsAt: string) => void;
}) {
  const grid = buildSlotHourGrid(slots);
  if (grid.hours.length === 0) {
    return null;
  }

  const slotCellClass = "h-8 w-[5.3125rem] shrink-0";

  return (
    <div
      className="grid w-fit max-w-full gap-2"
      style={{ gridTemplateColumns: `repeat(${grid.hours.length}, 5.3125rem)` }}
    >
      {Array.from({ length: grid.rowCount }, (_, row) =>
        grid.hours.map((hour) => {
          const minute = grid.minutesByHour.get(hour)?.[row];
          if (minute === undefined) {
            return <div key={`${hour}-${row}`} className={slotCellClass} aria-hidden="true" />;
          }
          const cell = grid.cells.get(slotCellKey(hour, minute));
          if (!cell) {
            return <div key={slotCellKey(hour, minute)} className={slotCellClass} aria-hidden="true" />;
          }
          const active = cell.startsAt === selectedStart;
          return (
            <Button
              key={cell.startsAt}
              type="button"
              size="sm"
              variant={active ? "default" : "outline"}
              className={cn(slotCellClass, "tabular-nums", !active && "bg-background")}
              aria-pressed={active}
              onClick={() => onSelect(cell.startsAt)}
            >
              {cell.label}
            </Button>
          );
        }),
      )}
    </div>
  );
}
