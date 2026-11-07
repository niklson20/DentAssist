"use client";

import { appointmentStatusLabel, type AppointmentStatus } from "@/lib/labels";
import { cn } from "@/lib/utils";

import { AppointmentCard } from "./appointment-card";
import type { DayGridColumn, DayGridModel } from "./day-calendar";
import { useHideCancelled } from "./hide-cancelled";

/** Pending uses destructive, the warning mix from the day grid. Offered uses primary. */
const STATUS_CLASS: Record<AppointmentStatus, string> = {
  pending_confirmation: "border-destructive/50 bg-destructive/25 text-foreground",
  offered: "border-primary bg-primary text-primary-foreground",
  scheduled: "border-border bg-secondary text-secondary-foreground",
  completed: "border-border bg-muted text-muted-foreground",
  no_show: "border-destructive/25 bg-destructive/10 text-destructive",
  cancelled: "border-border bg-background text-muted-foreground line-through opacity-60",
};

export function phoneDayColumn(model: DayGridModel, dentistId: string | null): DayGridColumn | null {
  if (dentistId) {
    const chosen = model.columns.find((column) => column.id === dentistId);
    if (chosen) {
      return chosen;
    }
  }
  return model.columns[0] ?? null;
}

export function PhoneDayList({
  model,
  dentistId,
}: {
  model: DayGridModel;
  dentistId: string | null;
}) {
  const column = phoneDayColumn(model, dentistId);
  const hidden = useHideCancelled();
  if (!column) {
    return <p className="p-4 text-sm text-muted-foreground">Nema stomatologa koji prima pacijente.</p>;
  }
  const visits = hidden ? column.visits.filter((visit) => visit.status !== "cancelled") : column.visits;

  return (
    <section aria-label={column.name} className="rounded-lg border border-border bg-card text-card-foreground">
      <h2 className="border-b border-border px-4 py-3 text-sm font-semibold" data-dentist={column.id}>
        {column.name}
      </h2>
      {visits.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">Nema termina.</p>
      ) : (
        <ul className="flex flex-col gap-2 p-3">
          {visits.map((visit) => (
            <AppointmentCard
              key={visit.id}
              appointmentId={visit.id}
              status={visit.status}
              style={{}}
              className={cn("rounded-md border px-3 py-2 text-sm", STATUS_CLASS[visit.status])}
            >
              <p>{visit.timeLabel}</p>
              <p>{visit.label}</p>
              <span className="sr-only">{appointmentStatusLabel(visit.status)}. Otvori detalje termina</span>
            </AppointmentCard>
          ))}
        </ul>
      )}
    </section>
  );
}
