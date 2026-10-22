"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { formatBelgrade } from "@/lib/calendar-dates";
import { cn } from "@/lib/utils";

import { formatBookingDayLabel } from "./booking-days";
import { fetchAvailableSlots } from "./slots-actions";

type ClinicSlotsPanelProps = {
  slug: string;
  dentistId: string;
  defaultDurationMin: number;
  todayIso: string;
  bookingDays: string[];
  initialDay: string;
  initialSlots: string[];
};

export function ClinicSlotsPanel({
  slug,
  dentistId,
  defaultDurationMin,
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
      : "#";

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
          <div className="flex flex-wrap gap-2">
            {slots.map((startsAt) => {
              const active = startsAt === selectedStart;
              return (
                <Button
                  key={startsAt}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "outline"}
                  className={cn(!active && "bg-background")}
                  aria-pressed={active}
                  onClick={() => setSelectedStart(startsAt)}
                >
                  {formatSlotRange(startsAt, defaultDurationMin)}
                </Button>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-auto border-t pt-4">
        <Button
          className="w-full"
          disabled={!selectedStart || !dentistId}
          render={<Link href={continueHref} aria-disabled={!selectedStart} />}
        >
          Nastavi
        </Button>
      </div>
    </section>
  );
}

function formatSlotRange(startsAtIso: string, durationMin: number): string {
  const start = new Date(startsAtIso);
  const end = new Date(start.getTime() + durationMin * 60 * 1000);
  const startLabel = formatBelgrade(start, { hour: "2-digit", minute: "2-digit" });
  const endLabel = formatBelgrade(end, { hour: "2-digit", minute: "2-digit" });
  return `${startLabel}–${endLabel}`;
}
