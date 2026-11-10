"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";

import { WEEKDAY_LONG, WEEKDAY_SHORT } from "./weekday-labels";

export type MonthDay = {
  datum: string;
  inMonth: boolean;
  closed: boolean;
  today: boolean;
  anchor: boolean;
  count: number;
  countLabel: string;
  href: string;
};

export type MonthModel = {
  title: string;
  anchor: string;
  today: string;
  days: MonthDay[];
};

export function MonthView({ model }: { model: MonthModel }) {
  return (
    <section aria-label="Mesec" className="bg-card text-card-foreground">
      <h2 className="border-b border-border px-4 py-3 text-base font-semibold">{model.title}</h2>
      <div className="grid grid-cols-7">
        {WEEKDAY_SHORT.map((weekday) => (
          <div key={weekday} className="border-b border-border px-2 py-2 text-center text-xs font-medium">
            {weekday}
          </div>
        ))}
        {model.days.map((day, index) => {
          const weekday = WEEKDAY_LONG[index % 7] ?? WEEKDAY_LONG[0];
          return (
            <Link
              key={day.datum}
              href={day.href}
              data-datum={day.datum}
              data-closed={day.closed ? "true" : undefined}
              data-today={day.today ? "true" : undefined}
              data-anchor={day.anchor ? "true" : undefined}
              aria-current={day.anchor ? "date" : undefined}
              aria-label={`${weekday} ${dayNumber(day.datum)}, ${day.countLabel}`}
              className={cn(
                "flex min-h-20 flex-col gap-1 border-b border-r border-border p-2 text-sm",
                day.inMonth ? "text-foreground" : "text-muted-foreground",
                day.closed && "bg-muted",
                day.anchor && !day.today && "ring-1 ring-inset ring-ring",
              )}
            >
              <span
                className={cn(
                  "inline-flex h-6 min-w-6 items-center justify-center self-start rounded-full px-1 font-medium",
                  day.today && "bg-primary text-primary-foreground",
                )}
              >
                {dayNumber(day.datum)}
              </span>
              {day.count > 0 ? <span>{day.count}</span> : null}
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
