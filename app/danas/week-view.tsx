import type { DayGridHour, DayGridVisit, GridBand, GridLine } from "./day-calendar";
import { TimeGrid } from "./day-grid";
import { shortDateLabel, weekdayLabels } from "./weekday-labels";

export type WeekDay = {
  datum: string;
  closed: boolean;
  segments: GridBand[];
  lines: GridLine[];
  breaks: GridBand[];
  visits: DayGridVisit[];
};

export type WeekModel = {
  dentistId: string | null;
  dentistName: string | null;
  today: string;
  span: number;
  hours: DayGridHour[];
  days: WeekDay[];
};

export function WeekView({ model }: { model: WeekModel }) {
  if (!model.dentistName || !model.dentistId || model.days.length !== 7) {
    return <p className="p-4 text-sm text-muted-foreground">Nema stomatologa koji prima pacijente.</p>;
  }

  return (
    <TimeGrid
      span={model.span}
      hours={model.hours}
      laneMin="5.5rem"
      lanes={model.days.map((day) => {
        const labels = weekdayLabels(day.datum);
        const dateLabel = shortDateLabel(day.datum);
        return {
          id: day.datum,
          datum: day.datum,
          ariaLabel: `${labels.long}, ${dateLabel}`,
          title: labels.short,
          dateLabel,
          subtitle: null,
          current: day.datum === model.today,
          closed: day.closed,
          segments: day.segments,
          lines: day.lines,
          breaks: day.breaks,
          visits: day.visits,
        };
      })}
    />
  );
}
