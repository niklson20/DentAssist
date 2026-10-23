import { formatBelgrade, startOfBelgradeDay } from "@/lib/calendar-dates";
import { appointmentStatusLabel, type AppointmentStatus } from "@/lib/labels";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type VisitHistoryItem = {
  id: string;
  status: AppointmentStatus;
  dentist: string;
  date: string;
};

export type VisitYearGroup = {
  year: string;
  visits: VisitHistoryItem[];
};

export function groupVisitsByYear(visits: readonly VisitHistoryItem[]): VisitYearGroup[] {
  const sorted = [...visits].sort((left, right) => right.date.localeCompare(left.date));
  const groups: VisitYearGroup[] = [];

  for (const visit of sorted) {
    const year = visitYear(visit.date);
    if (!year) {
      continue;
    }
    const current = groups[groups.length - 1];
    if (current?.year === year) {
      current.visits.push(visit);
    } else {
      groups.push({ year, visits: [visit] });
    }
  }

  return groups;
}

export function VisitHistory({ visits }: { visits: readonly VisitHistoryItem[] }) {
  const groups = groupVisitsByYear(visits);

  return (
    <section
      aria-labelledby="visit-history-heading"
      className="rounded-lg border border-border bg-card p-4 text-card-foreground"
    >
      <h2 id="visit-history-heading" className="text-lg font-semibold">
        Istorija
      </h2>
      {groups.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nema termina.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.year} aria-label={group.year} data-year={group.year}>
              <h3 className="text-sm font-medium text-muted-foreground">{group.year}</h3>
              <ul className="mt-2 divide-y divide-border">
                {group.visits.map((visit) => (
                  <li
                    key={visit.id}
                    className="flex flex-wrap gap-x-4 gap-y-1 py-2 text-sm text-foreground"
                  >
                    <span>{appointmentStatusLabel(visit.status)}</span>
                    <span>{visit.dentist.trim() || "—"}</span>
                    <time dateTime={visit.date}>{formatVisitDate(visit.date)}</time>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function visitYear(date: string): string | null {
  return ISO_DATE.exec(date)?.[1] ?? null;
}

function formatVisitDate(isoDate: string): string {
  if (!ISO_DATE.test(isoDate)) {
    return isoDate;
  }
  return formatBelgrade(startOfBelgradeDay(isoDate), {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
}
