import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { belgradeLocalToISO, type CalendarQuery } from "@/lib/calendar-dates";
import type { AppointmentStatus } from "@/lib/labels";

import { monthFromRows } from "./load-month";
import { MonthView } from "./month-view";
import { calendarPath } from "./schema";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const datum = "2026-06-08";
const ana = "11111111-1111-4111-8111-111111111111";
const boris = "22222222-2222-4222-8222-222222222222";
const reception = "33333333-3333-4333-8333-333333333333";
const mika = "44444444-4444-4444-8444-444444444444";

const query: CalendarQuery = {
  prikaz: "mesec",
  datum,
  stomatolog: null,
  sakrijOtkazane: true,
};

const viewSource = readFileSync(path.join(process.cwd(), "app/danas/month-view.tsx"), "utf8");
const loadSource = readFileSync(path.join(process.cwd(), "app/danas/load-month.ts"), "utf8");
const pageSource = readFileSync(path.join(process.cwd(), "app/danas/page.tsx"), "utf8");
const shellSource = readFileSync(path.join(process.cwd(), "app/danas/calendar-shell.tsx"), "utf8");

const weekdays = ["Ponedeljak", "Utorak", "Sreda", "Četvrtak", "Petak", "Subota", "Nedelja"];

function at(day: number, hour: number, minute: number): string {
  return belgradeLocalToISO({ year: 2026, month: 6, day, hour, minute });
}

function visit(id: string, dentistId: string, status: AppointmentStatus, day: number, hour: number) {
  return {
    id,
    dentist_id: dentistId,
    patient_id: mika,
    starts_at: at(day, hour, 0),
    ends_at: at(day, hour, 30),
    status,
  };
}

const members = [
  { id: boris, first_name: "Boris", last_name: "Borić", sees_patients: true },
  { id: reception, first_name: "Rade", last_name: "Radić", sees_patients: false },
  { id: ana, first_name: "Ana", last_name: "Anić", sees_patients: true },
];

const appointments = [
  visit("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", ana, "scheduled", 8, 9),
  visit("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", boris, "scheduled", 8, 10),
  visit("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3", ana, "cancelled", 8, 11),
  visit("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4", ana, "scheduled", 9, 9),
  visit("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5", reception, "scheduled", 8, 12),
];

describe("month view", () => {
  it("shows the appointment count and a click opens that day", () => {
    const model = monthFromRows({ query, members, appointments });
    expect(model).not.toBeNull();
    if (!model) {
      return;
    }

    const dates = model.days.map((day) => day.datum);
    expect(dates.slice(0, 8)).toEqual([
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
      "2026-06-04",
      "2026-06-05",
      "2026-06-06",
      "2026-06-07",
      datum,
    ]);
    expect(dates).toHaveLength(35);
    expect(dates.at(-1)).toBe("2026-07-05");
    expect(dates).not.toContain("2026-05-31");

    const june8 = model.days.find((day) => day.datum === datum);
    const june9 = model.days.find((day) => day.datum === "2026-06-09");
    expect(june8?.count).toBe(2);
    expect(june8?.countLabel).toBe("2 termina");
    expect(june8?.href).toBe(calendarPath(query, { prikaz: "dan", datum }));
    expect(june9?.count).toBe(1);
    expect(june9?.countLabel).toBe("1 termin");
    expect(june9?.href).toBe(calendarPath(query, { prikaz: "dan", datum: "2026-06-09" }));

    const html = renderToStaticMarkup(<MonthView model={model} />);
    const rendered = [...html.matchAll(/data-datum="(\d{4}-\d{2}-\d{2})"/g)].map((match) => match[1]);
    expect(rendered.slice(0, 8)).toEqual(dates.slice(0, 8));
    let cursor = -1;
    for (const weekday of weekdays) {
      const atIndex = html.indexOf(weekday);
      expect(atIndex).toBeGreaterThan(cursor);
      cursor = atIndex;
    }
    const href = june8?.href.replace(/&/g, "&amp;") ?? "";
    const start = html.indexOf(`href="${href}"`);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(html.slice(start, html.indexOf("</a>", start))).toContain("2 termina");
    expect(html).toContain('href="/danas?prikaz=dan&amp;datum=2026-06-09&amp;sakrijOtkazane=da"');

    const visible = monthFromRows({
      query: { ...query, sakrijOtkazane: false },
      members,
      appointments,
    });
    expect(visible?.days.find((day) => day.datum === datum)?.countLabel).toBe("3 termina");

    const onlyAna = monthFromRows({
      query: { ...query, stomatolog: ana },
      members,
      appointments,
    });
    const anaDay = onlyAna?.days.find((day) => day.datum === datum);
    expect(anaDay?.count).toBe(1);
    expect(anaDay?.href).toBe(calendarPath({ ...query, stomatolog: ana }, { prikaz: "dan", datum }));

    expect(loadSource).toContain("startOfBelgradeWeek");
    expect(viewSource).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(viewSource.toLowerCase()).not.toContain("supabase");
    expect(pageSource).toContain("loadMonthCalendar");
    expect(pageSource).toContain("MonthView");
    expect(pageSource).toContain('query.prikaz === "mesec"');
    expect(pageSource.toLowerCase()).not.toContain("supabase");
    expect(shellSource).toContain("monthCalendar");
    expect(shellSource).toContain('query.prikaz === "dan"');
    expect(shellSource.toLowerCase()).not.toContain("supabase");
  });
});
