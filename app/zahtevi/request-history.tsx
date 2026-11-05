import type { RequestListItem } from "@/app/actions/appointments";
import { REQUEST_SECTION_LABELS, type RequestSection } from "@/lib/request-section";

export function RequestHistoryList({
  section,
  requests,
}: {
  section: Exclude<RequestSection, "pending">;
  requests: RequestListItem[];
}) {
  return (
    <section
      aria-label={REQUEST_SECTION_LABELS[section]}
      className="w-full rounded-lg border border-border bg-card p-3 text-card-foreground"
    >
      {requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nema zahteva.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {requests.map((request) => (
            <HistoryCard key={request.id} section={section} request={request} />
          ))}
        </ul>
      )}
    </section>
  );
}

function HistoryCard({
  section,
  request,
}: {
  section: Exclude<RequestSection, "pending">;
  request: RequestListItem;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-md border border-border bg-background px-3 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-medium text-foreground">{request.name}</p>
        <p className="shrink-0 text-sm tabular-nums text-muted-foreground">{request.timeLabel}</p>
      </div>
      <dl className="grid grid-cols-[5.75rem_minmax(0,1fr)] gap-x-2 text-sm">
        <dt className="text-muted-foreground">Stomatolog</dt>
        <dd className="truncate text-foreground">{request.dentistName}</dd>
        <dt className="text-muted-foreground">Razlog</dt>
        <dd className="truncate text-foreground">{request.reason}</dd>
        {section === "rejected" && request.rejectedBy ? (
          <>
            <dt className="text-muted-foreground">Odbio</dt>
            <dd className="text-foreground">{request.rejectedBy === "staff" ? "Ordinacija" : "Pacijent"}</dd>
          </>
        ) : null}
        {section === "rejected" && request.note ? (
          <>
            <dt className="text-muted-foreground">Poruka</dt>
            <dd className="text-foreground">{request.note}</dd>
          </>
        ) : null}
        {section === "expired" ? (
          <>
            <dt className="text-muted-foreground">Odgovor do</dt>
            <dd className="text-foreground">{request.deadlineLabel}</dd>
          </>
        ) : null}
      </dl>
    </li>
  );
}
