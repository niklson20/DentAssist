import type { CSSProperties } from "react";

import { appointmentStatusLabel } from "@/lib/labels";

import type { DayGridModel, DayGridVisit } from "./day-calendar";

export function DayGrid({ model }: { model: DayGridModel }) {
  if (model.columns.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">Nema stomatologa koji prima pacijente.</p>;
  }

  const style = { "--calendar-span": String(model.span) } as CSSProperties;

  return (
    <div className="calendar-grid" style={style}>
      <div className="calendar-grid__hours">
        <div className="calendar-grid__hours-pad" aria-hidden="true" />
        <ol className="calendar-grid__hours-list" aria-label="Sati">
          {model.hours.map((hour) => (
            <li key={hour.hour} className="calendar-grid__hour" style={{ top: hour.top }}>
              {hour.label}
            </li>
          ))}
        </ol>
      </div>
      <div className="calendar-grid__columns">
        {model.columns.map((column) => (
          <section key={column.id} className="calendar-grid__column" aria-label={column.name}>
            <h2 className="calendar-grid__head">{column.name}</h2>
            <div className="calendar-grid__track">
              {column.visits.map((visit) => {
                const warning = warningNote(visit);
                return (
                  <article
                    key={visit.id}
                    className="calendar-grid__visit"
                    data-status={visit.status}
                    style={{ top: visit.top, height: visit.height }}
                  >
                    <p className="calendar-grid__visit-line">{visit.timeLabel}</p>
                    <p className="calendar-grid__visit-line">{visit.label}</p>
                    {warning ? (
                      <p className="calendar-grid__visit-line" role="alert">
                        {warning}
                      </p>
                    ) : null}
                    <p className="sr-only">{appointmentStatusLabel(visit.status)}</p>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function warningNote(visit: DayGridVisit): string | null {
  const record: unknown = visit;
  if (!record || typeof record !== "object" || !("alertNote" in record)) {
    return null;
  }
  const note = record.alertNote;
  if (typeof note !== "string") {
    return null;
  }
  const text = note.trim();
  return text.length > 0 ? text : null;
}
