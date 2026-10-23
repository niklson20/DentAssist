import { appointmentStatusLabel, type AppointmentStatus } from "@/lib/labels";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Ponedeljak", "Utorak", "Sreda", "Četvrtak", "Petak", "Subota", "Nedelja"] as const;

/** Pending uses destructive, the warning mix from the day grid. Offered uses primary. */
const STATUS_CLASS: Record<AppointmentStatus, string> = {
  pending_confirmation: "border-destructive/50 bg-destructive/25 text-foreground",
  offered: "border-primary bg-primary text-primary-foreground",
  scheduled: "border-border bg-secondary text-secondary-foreground",
  completed: "border-border bg-muted text-muted-foreground",
  no_show: "border-destructive/25 bg-destructive/10 text-destructive",
  cancelled: "border-border bg-background text-muted-foreground line-through opacity-60",
};

export type WeekVisit = {
  id: string;
  status: AppointmentStatus;
  label: string;
  timeLabel: string;
};

export type WeekDay = {
  datum: string;
  visits: WeekVisit[];
};

export type WeekModel = {
  dentistId: string | null;
  dentistName: string | null;
  days: WeekDay[];
};

export function WeekView({ model }: { model: WeekModel }) {
  if (!model.dentistName || !model.dentistId || model.days.length !== 7) {
    return <p className="p-4 text-sm text-muted-foreground">Nema stomatologa koji prima pacijente.</p>;
  }

  return (
    <section aria-label="Pregled nedelje" className="overflow-x-auto bg-card text-card-foreground">
      <h2 className="border-b border-border px-4 py-3 text-sm font-semibold" data-dentist={model.dentistId}>
        {model.dentistName}
      </h2>
      <div className="grid min-w-[56rem] grid-cols-7 divide-x divide-border">
        {model.days.map((day, index) => {
          const weekday = WEEKDAYS[index] ?? WEEKDAYS[0];
          return (
            <section key={day.datum} aria-label={weekday} data-datum={day.datum} className="min-w-0">
              <h3 className="border-b border-border px-2 py-2 text-sm font-medium">{weekday}</h3>
              <p className="px-2 pt-2 text-xs text-muted-foreground">{dayNumber(day.datum)}</p>
              <ul className="flex flex-col gap-1 p-2">
                {day.visits.map((visit) => (
                  <li
                    key={visit.id}
                    data-status={visit.status}
                    className={cn("rounded-md border px-1.5 py-1 text-xs", STATUS_CLASS[visit.status])}
                  >
                    <p>{visit.timeLabel}</p>
                    <p>{visit.label}</p>
                    <p className="sr-only">{appointmentStatusLabel(visit.status)}</p>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function dayNumber(datum: string): string {
  return String(Number(datum.slice(8, 10)));
}
