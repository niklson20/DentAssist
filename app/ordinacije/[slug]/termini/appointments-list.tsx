import { formatBelgrade } from "@/lib/calendar-dates";
import { appointmentStatusLabel } from "@/lib/labels";

import type { MyAppointment } from "./load-appointments";

export function AppointmentsList({ items }: { items: MyAppointment[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Nemate termine u ovoj ordinaciji.</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item, index) => (
        <li
          key={`${item.startsAt}-${item.endsAt}-${item.dentistName}-${item.status}-${index}`}
          className="rounded-lg border border-border bg-card p-4 text-card-foreground"
        >
          <p className="font-medium">{formatAppointmentWhen(item.startsAt, item.endsAt)}</p>
          <p className="mt-1 text-sm text-muted-foreground">{item.dentistName}</p>
          <p className="mt-1 text-sm">{appointmentStatusLabel(item.status)}</p>
        </li>
      ))}
    </ul>
  );
}

function formatAppointmentWhen(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const day = formatBelgrade(start, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const startClock = formatBelgrade(start, { hour: "2-digit", minute: "2-digit" });
  const endClock = formatBelgrade(end, { hour: "2-digit", minute: "2-digit" });
  return `${day}, ${startClock}–${endClock}`;
}
