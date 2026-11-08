import { formatBelgrade } from "@/lib/calendar-dates";
import { appointmentStatusLabel } from "@/lib/labels";

import { ReviewForm } from "./review-form";
import type { ProfileAppointment } from "./load-appointments";

export function ProfileAppointmentsList({ items }: { items: ProfileAppointment[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Još nemate zakazanih termina.</p>;
  }

  return (
    <ol className="flex flex-col gap-3">
      {items.map((item) => (
        <li
          key={item.appointmentId}
          className="rounded-lg border border-border bg-card p-4 text-card-foreground"
        >
          <p className="font-medium">{formatAppointmentWhen(item.startsAt, item.endsAt)}</p>
          <p className="mt-1 text-sm">{item.clinicName}</p>
          <p className="mt-1 text-sm text-muted-foreground">{item.dentistName}</p>
          <p className="mt-1 text-sm">{appointmentStatusLabel(item.status)}</p>
          {item.status === "completed" ? (
            <ReviewForm
              appointmentId={item.appointmentId}
              clinicRating={item.clinicRating}
              dentistRating={item.dentistRating}
            />
          ) : null}
        </li>
      ))}
    </ol>
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
