import type { CSSProperties } from "react";

import { isIsoDate } from "@/lib/calendar-dates";
import { appointmentStatusLabel } from "@/lib/labels";

import type { DayGridHour, DayGridModel, DayGridVisit, GridBand, GridLine } from "./day-calendar";
import { shortDateLabel, weekdayLabels } from "./weekday-labels";

export type TimeLane = {
  id: string;
  datum?: string;
  ariaLabel: string;
  title: string;
  dateLabel: string;
  subtitle: string | null;
  current: boolean;
  closed: boolean;
  segments: GridBand[];
  lines: GridLine[];
  breaks: GridBand[];
  visits: DayGridVisit[];
};

export function TimeGrid({
  span,
  hours,
  lanes,
  laneMin,
}: {
  span: number;
  hours: DayGridHour[];
  lanes: TimeLane[];
  laneMin: string;
}) {
  const style = {
    "--calendar-span": String(span),
    "--calendar-lanes": String(lanes.length),
    "--calendar-lane-min": laneMin,
  } as CSSProperties;

  return (
    <div className="calendar-grid" style={style} data-closed-axis={hours.length === 0 ? "true" : undefined}>
      <div className="calendar-grid__headrow">
        <div className="calendar-grid__corner" aria-hidden="true" />
        {lanes.map((lane) => (
          <h2
            key={lane.id}
            className="calendar-grid__head"
            data-current={lane.current ? "true" : undefined}
          >
            <span className="calendar-grid__head-line">{lane.title}</span>
            <span className="calendar-grid__head-line calendar-grid__head-date">{lane.dateLabel}</span>
            {lane.subtitle ? <span className="calendar-grid__head-line">{lane.subtitle}</span> : null}
          </h2>
        ))}
      </div>
      <div className="calendar-grid__body">
        <div className="calendar-grid__hours">
          <ol className="calendar-grid__hours-list" aria-label="Sati">
            {hours.map((hour) => (
              <li key={hour.hour} className="calendar-grid__hour" style={{ top: hour.top }}>
                {hour.label}
              </li>
            ))}
          </ol>
        </div>
        <div className="calendar-grid__columns">
          {lanes.map((lane) => (
            <section
              key={lane.id}
              className="calendar-grid__column"
              aria-label={lane.ariaLabel}
              data-datum={lane.datum}
              data-closed={lane.closed ? "true" : undefined}
            >
              <div className="calendar-grid__track">
                {lane.segments.map((segment) => (
                  <div
                    key={`${segment.top}-${segment.height}`}
                    className="calendar-grid__open"
                    style={{ top: segment.top, height: segment.height }}
                  />
                ))}
                {lane.lines.map((line) => (
                  <div
                    key={line.minute}
                    className="calendar-grid__line"
                    data-hour={line.hour ? "true" : undefined}
                    style={{ top: line.top }}
                  />
                ))}
                {lane.breaks.map((pause) => (
                  <div
                    key={`${pause.top}-${pause.height}`}
                    className="calendar-grid__break"
                    style={{ top: pause.top, height: pause.height }}
                  >
                    Pauza
                  </div>
                ))}
                {lane.closed ? <p className="calendar-grid__closed">Zatvoreno</p> : null}
                {lane.visits.map((visit) => {
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
    </div>
  );
}

export function DayGrid({ model }: { model: DayGridModel }) {
  if (model.columns.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">Nema stomatologa koji prima pacijente.</p>;
  }

  const labels = headingLabels(model.datum);
  const severalDentists = model.columns.length > 1;

  return (
    <TimeGrid
      span={model.span}
      hours={model.hours}
      laneMin="14rem"
      lanes={model.columns.map((column) => ({
        id: column.id,
        ariaLabel: severalDentists
          ? `${labels.long}, ${labels.dateLabel}, ${column.name}`
          : `${labels.long}, ${labels.dateLabel}`,
        title: labels.short,
        dateLabel: labels.dateLabel,
        subtitle: severalDentists ? column.name : null,
        current: true,
        closed: column.closed === true,
        segments: column.segments ?? [],
        lines: column.lines ?? [],
        breaks: column.breaks ?? [],
        visits: column.visits,
      }))}
    />
  );
}

function headingLabels(datum: string): { long: string; short: string; dateLabel: string } {
  if (!isIsoDate(datum)) {
    return { long: "Dan", short: "DAN", dateLabel: "" };
  }
  const labels = weekdayLabels(datum);
  return { long: labels.long, short: labels.short, dateLabel: shortDateLabel(datum) };
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
