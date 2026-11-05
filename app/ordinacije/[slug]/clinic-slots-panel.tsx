"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { formatBookingDayLabel } from "./booking-days";
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
  const [selectedStart, setSelectedStart] = useState<string | null>(null);
  const [slots, setSlots] = useState(initialSlots);
  const [isPending, startTransition] = useTransition();

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
        <div className="flex gap-2 overflow-x-auto pb-1">
          {bookingDays.map((day) => {
            const active = day === selectedDay;
            return (
              <Button
                key={day}
                type="button"
                size="sm"
                variant={active ? "default" : "outline"}
                className={cn("shrink-0", !active && "bg-background")}
                aria-pressed={active}
                disabled={isPending && !active}
                onClick={() => {
                  if (day !== selectedDay) {
                    setSelectedStart(null);
                    setSelectedDay(day);
                  }
                }}
              >
                {formatBookingDayLabel(day, todayIso)}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium">Slobodni termini</h2>
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
