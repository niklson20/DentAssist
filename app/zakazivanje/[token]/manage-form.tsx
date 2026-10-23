"use client";

import { useState, useTransition } from "react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import { formatBelgrade, localTimeOnDate } from "@/lib/calendar-dates";
import { cn } from "@/lib/utils";

import { cancelAppointment, loadManageSlots, rescheduleAppointment } from "./actions";
import {
  ALREADY_MOVED,
  formatManageTime,
  formatOfferDentist,
  formatOfferWhen,
  manageDayOptions,
  NO_SLOTS,
  TERMIN_CANCELLED,
  TERMIN_MOVED,
  type ManageSlot,
} from "./schema";

type Moved = { status: "rescheduled" };
type Cancelled = { status: "cancelled" };

type AppointmentDetailsProps = {
  clinicName: string;
  startsAt: string;
  endsAt: string;
  dentistFirstName: string;
  dentistLastName: string;
};

export function AppointmentDetails({
  clinicName,
  startsAt,
  endsAt,
  dentistFirstName,
  dentistLastName,
}: AppointmentDetailsProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">{clinicName}</p>
      <p>
        <span className="block text-sm font-medium">Trenutni termin</span>
        <span className="block">{formatOfferWhen(startsAt, endsAt)}</span>
      </p>
      <p className="text-sm">Stomatolog {formatOfferDentist({ dentistFirstName, dentistLastName })}</p>
    </div>
  );
}

type ManageFormProps = AppointmentDetailsProps & {
  token: string;
  canReschedule: boolean;
  today: string;
  maxAheadDays: number;
  initialDay: string;
  slots: ManageSlot[];
};

export function ManageForm({
  token,
  clinicName,
  startsAt,
  endsAt,
  dentistFirstName,
  dentistLastName,
  canReschedule,
  today,
  maxAheadDays,
  initialDay,
  slots: initialSlots,
}: ManageFormProps) {
  const [moved, moveAction, moving] = useActionState<ActionResult<Moved> | null, FormData>(
    rescheduleAppointment,
    null,
  );
  const [cancelled, cancelAction, cancelling] = useActionState<ActionResult<Cancelled> | null, FormData>(
    cancelAppointment,
    null,
  );
  const [day, setDay] = useState(initialDay);
  const [slots, setSlots] = useState(initialSlots);
  const [selected, setSelected] = useState<string | null>(null);
  const [dayError, setDayError] = useState<string | null>(null);
  const [loadingDay, startDayChange] = useTransition();
  const pending = moving || cancelling;
  const error = actionError(moved) ?? actionError(cancelled) ?? dayError;
  const days = manageDayOptions(today, maxAheadDays);
  const activeDay = days.includes(day) ? day : (days[0] ?? day);

  function chooseDay(next: string) {
    if (next === activeDay || pending || loadingDay) {
      return;
    }
    setSelected(null);
    setDay(next);
    startDayChange(async () => {
      const result = await loadManageSlots(token, next);
      if (result.ok) {
        setSlots(result.data.slots);
        setDayError(null);
        return;
      }
      setSlots([]);
      setDayError(result.error);
    });
  }

  if (moved?.ok) {
    return <p role="status">{TERMIN_MOVED}</p>;
  }
  if (cancelled?.ok) {
    return <p role="status">{TERMIN_CANCELLED}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <AppointmentDetails
        clinicName={clinicName}
        startsAt={startsAt}
        endsAt={endsAt}
        dentistFirstName={dentistFirstName}
        dentistLastName={dentistLastName}
      />
      {canReschedule ? (
        <form action={moveAction} className="flex flex-col gap-4">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="startsAt" value={selected ?? ""} />
          <div className="space-y-2">
            <h2 className="text-sm font-medium">Izaberite dan</h2>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {days.map((option) => {
                const active = option === activeDay;
                return (
                  <Button
                    key={option}
                    type="button"
                    size="sm"
                    variant={active ? "default" : "outline"}
                    className={cn("shrink-0", !active && "bg-background")}
                    aria-pressed={active}
                    disabled={pending || loadingDay}
                    onClick={() => chooseDay(option)}
                  >
                    {dayLabel(option, today)}
                  </Button>
                );
              })}
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-sm font-medium">Slobodni termini</h2>
            {loadingDay ? (
              <p className="text-sm text-muted-foreground">Učitavanje…</p>
            ) : slots.length === 0 ? (
              <p className="text-sm text-muted-foreground">{NO_SLOTS}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {slots.map((slot) => {
                  const active = selected === slot.startsAt;
                  return (
                    <Button
                      key={slot.startsAt}
                      type="button"
                      size="sm"
                      variant={active ? "default" : "outline"}
                      className={cn(!active && "bg-background")}
                      aria-pressed={active}
                      disabled={pending}
                      onClick={() => setSelected(slot.startsAt)}
                    >
                      {formatManageTime(slot.startsAt)}
                    </Button>
                  );
                })}
              </div>
            )}
          </div>
          <Button type="submit" disabled={pending || loadingDay || !selected}>
            {moving ? "Pomeranje…" : "Pomeri termin"}
          </Button>
        </form>
      ) : (
        <p className="text-sm">{ALREADY_MOVED}</p>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <form action={cancelAction}>
        <input type="hidden" name="token" value={token} />
        <Button type="submit" variant="outline" disabled={pending}>
          {cancelling ? "Otkazivanje…" : "Otkaži termin"}
        </Button>
      </form>
    </div>
  );
}

function dayLabel(isoDate: string, todayIso: string): string {
  if (isoDate === todayIso) {
    return "Danas";
  }
  return formatBelgrade(localTimeOnDate(isoDate, "12:00"), {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function actionError(result: ActionResult<unknown> | null): string | null {
  if (!result || result.ok) {
    return null;
  }
  return result.error;
}
