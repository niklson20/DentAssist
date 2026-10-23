import Link from "next/link";

import { cn } from "@/lib/utils";

export type MonthDay = {
  datum: string;
  inMonth: boolean;
  count: number;
  countLabel: string;
  href: string;
};

export type MonthModel = {
  title: string;
  anchor: string;
  days: MonthDay[];
};

const WEEKDAYS = ["Ponedeljak", "Utorak", "Sreda", "Četvrtak", "Petak", "Subota", "Nedelja"] as const;

export function MonthView({ model }: { model: MonthModel }) {
  return (
    <section aria-label="Mesec" className="bg-card text-card-foreground">
      <h2 className="border-b border-border px-4 py-3 text-base font-semibold">{model.title}</h2>
      <div className="grid grid-cols-7">
        {WEEKDAYS.map((weekday) => (
          <div key={weekday} className="border-b border-border px-2 py-2 text-xs font-medium text-muted-foreground">
            {weekday}
          </div>
        ))}
        {model.days.map((day, index) => {
          const weekday = WEEKDAYS[index % 7] ?? WEEKDAYS[0];
          const current = day.datum === model.anchor;
          return (
            <Link
              key={day.datum}
              href={day.href}
              data-datum={day.datum}
              aria-current={current ? "date" : undefined}
              aria-label={`${weekday} ${dayNumber(day.datum)}, ${day.countLabel}`}
              className={cn(
                "flex min-h-20 flex-col gap-1 border-b border-r border-border p-2 text-sm",
                day.inMonth ? "text-foreground" : "text-muted-foreground",
                current && "bg-accent text-accent-foreground",
              )}
            >
              <span className="font-medium">{dayNumber(day.datum)}</span>
              <span>{day.countLabel}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function dayNumber(datum: string): string {
  return String(Number(datum.slice(8, 10)));
}
