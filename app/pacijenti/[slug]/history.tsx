import { formatBelgrade, startOfBelgradeDay } from "@/lib/calendar-dates";
import { appointmentStatusLabel, type AppointmentStatus } from "@/lib/labels";
import { cn } from "@/lib/utils";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type VisitHistoryNote = {
  procedureDescription: string;
  recommendations: string;
  treatmentPlan: string;
  internalNotes: string;
};

export type VisitHistoryItem = {
  id: string;
  status: AppointmentStatus;
  dentist: string;
  date: string;
  /** Set for completed visits when clinical staff loads the chart. `null` means finished without a note. */
  note?: VisitHistoryNote | null;
};

export type VisitYearGroup = {
  year: string;
  visits: VisitHistoryItem[];
};

const NOTE_FIELDS = [
  { key: "procedureDescription", label: "Opis zahvata" },
  { key: "recommendations", label: "Preporuke" },
  { key: "treatmentPlan", label: "Plan daljeg lečenja" },
  { key: "internalNotes", label: "Interne beleške" },
] as const;

const rowClass =
  "grid grid-cols-[1.25rem_minmax(7rem,9rem)_minmax(0,1fr)_auto] items-center gap-x-3 py-2.5 text-sm";

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

  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">Nema termina.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group.year} aria-label={group.year} data-year={group.year}>
          <h3 className="text-sm font-medium text-muted-foreground">{group.year}</h3>
          <div className="mt-2 min-w-80 overflow-x-auto">
            <div
              className={cn(rowClass, "border-b border-border text-muted-foreground")}
              role="row"
            >
              <span aria-hidden="true" />
              <span className="font-medium">Status</span>
              <span className="font-medium">Stomatolog</span>
              <span className="font-medium">Datum</span>
            </div>
            <ul className="divide-y divide-border">
              {group.visits.map((visit) => (
                <li key={visit.id}>
                  {visit.status === "completed" && visit.note !== undefined ? (
                    <CompletedVisitRow visit={visit} note={visit.note} />
                  ) : (
                    <VisitRow visit={visit} />
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}
    </div>
  );
}

function VisitRow({ visit }: { visit: VisitHistoryItem }) {
  return (
    <div className={rowClass}>
      <span aria-hidden="true" className="size-3.5" />
      <span>{appointmentStatusLabel(visit.status)}</span>
      <span>{visit.dentist.trim() || "—"}</span>
      <time dateTime={visit.date}>{formatVisitDate(visit.date)}</time>
    </div>
  );
}

function CompletedVisitRow({
  visit,
  note,
}: {
  visit: VisitHistoryItem;
  note: VisitHistoryNote | null;
}) {
  return (
    <details className="group">
      <summary
        className={cn(
          rowClass,
          "cursor-pointer list-none marker:content-none [&::-webkit-details-marker]:hidden",
        )}
      >
        <Chevron />
        <span>{appointmentStatusLabel(visit.status)}</span>
        <span>{visit.dentist.trim() || "—"}</span>
        <time dateTime={visit.date}>{formatVisitDate(visit.date)}</time>
      </summary>
      <div className="pb-3 pl-[calc(1.25rem+0.75rem)] pt-1">
        {note ? <VisitNoteView note={note} /> : <MissingVisitMark />}
      </div>
    </details>
  );
}

function VisitNoteView({ note }: { note: VisitHistoryNote }) {
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      {NOTE_FIELDS.map((field) => {
        const value = note[field.key].trim();
        return (
          <div key={field.key} className="flex flex-col gap-1">
            <dt className="font-medium text-muted-foreground">{field.label}</dt>
            <dd className="whitespace-pre-wrap text-foreground">{value.length > 0 ? value : "—"}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function MissingVisitMark() {
  return (
    <p
      role="status"
      className="w-fit rounded-md border border-destructive px-2 py-1 text-sm font-medium text-destructive"
    >
      Termin završen bez zapisa
    </p>
  );
}

function Chevron() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
    >
      <path
        fill="currentColor"
        d="M6.22 3.22a.75.75 0 0 1 1.06 0l4 4a.75.75 0 0 1 0 1.06l-4 4a.75.75 0 1 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z"
      />
    </svg>
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
