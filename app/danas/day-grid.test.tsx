import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { belgradeLocalToISO, formatBelgrade, localTimeOnDate } from "@/lib/calendar-dates";
import { APPOINTMENT_STATUSES, CALENDAR_APPOINTMENT_STATUSES } from "@/lib/labels";

import { dayFromRows } from "./day-calendar";
import { DayGrid } from "./day-grid";

const datum = "2026-10-23";
const ana = "11111111-1111-4111-8111-111111111111";
const boris = "22222222-2222-4222-8222-222222222222";
const reception = "33333333-3333-4333-8333-333333333333";
const mika = "44444444-4444-4444-8444-444444444444";

const gridSource = readFileSync(path.join(process.cwd(), "app/danas/day-grid.tsx"), "utf8");
const pageSource = readFileSync(path.join(process.cwd(), "app/danas/page.tsx"), "utf8");
const shellSource = readFileSync(path.join(process.cwd(), "app/danas/calendar-shell.tsx"), "utf8");
const cssSource = readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

function at(hour: number, minute: number): string {
  return belgradeLocalToISO({ year: 2026, month: 10, day: 23, hour, minute });
}

function hourLabel(hour: number): string {
  return formatBelgrade(localTimeOnDate(datum, `${String(hour).padStart(2, "0")}:00:00`), {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function visit(
  id: string,
  dentistId: string,
  status: (typeof APPOINTMENT_STATUSES)[number],
  hour: number,
  minute: number,
  patientId: string | null = null,
) {
  const endMinute = minute + 30;
  return {
    id,
    dentist_id: dentistId,
    patient_id: patientId,
    starts_at: at(hour, minute),
    ends_at: at(hour + Math.floor(endMinute / 60), endMinute % 60),
    status,
  };
}

const members = [
  { id: boris, first_name: "Boris", last_name: "Borić", sees_patients: true },
  { id: reception, first_name: "Rade", last_name: "Radić", sees_patients: false },
  { id: ana, first_name: "Ana", last_name: "Anić", sees_patients: true },
];

const appointments = [
  visit("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", ana, "pending_confirmation", 8, 30),
  visit("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", ana, "offered", 9, 0),
  visit("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3", ana, "scheduled", 10, 0, mika),
  visit("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4", ana, "completed", 11, 0),
  visit("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5", ana, "no_show", 12, 0),
  visit("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6", ana, "cancelled", 13, 0),
  visit("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7", boris, "scheduled", 14, 0),
];

const patients = [{ id: mika, first_name: "Mika", last_name: "Mikić" }];

const hours = [
  { clinic_member_id: reception, iso_dow: 5, is_closed: false, opens_at: "07:00:00", closes_at: "08:00:00" },
  {
    clinic_member_id: ana,
    iso_dow: 5,
    is_closed: false,
    opens_at: "09:00:00",
    closes_at: "17:00:00",
    break_starts_at: "12:00:00",
    break_ends_at: "13:00:00",
  },
  { clinic_member_id: boris, iso_dow: 5, is_closed: true, opens_at: null, closes_at: null },
];

describe("day grid", () => {
  it("shows dentist columns, a vertical hour axis that stays while columns scroll, and status colors from theme tokens", () => {
    const model = dayFromRows({
      datum,
      members,
      appointments,
      patients,
      hours,
    });
    expect(model).not.toBeNull();
    if (!model) {
      return;
    }

    const html = renderToStaticMarkup(<DayGrid model={model} />);
    const hoursList = html.slice(html.indexOf('aria-label="Sati"'), html.indexOf("calendar-grid__columns"));
    const tops = [...hoursList.matchAll(/style="top:([0-9.]+)%"/g)].map((match) => Number(match[1]));

    expect(html.indexOf('class="calendar-grid"')).toBeLessThan(html.indexOf("calendar-grid__hours"));
    expect(html.indexOf("calendar-grid__hours")).toBeLessThan(html.indexOf("calendar-grid__columns"));
    expect(html.match(/class="calendar-grid__column"/g)).toHaveLength(2);
    expect(html).toContain("Petak");
    expect(html).toContain("PET");
    expect(html).toContain("23. 10.");
    expect(html).not.toContain("23. oktobar 2026.");
    expect(html.indexOf("Ana Anić")).toBeLessThan(html.indexOf("Boris Borić"));
    expect(model.hours[0]?.hour).toBe(9);
    expect(model.hours.at(-1)?.hour).toBe(17);
    const anaColumn = model.columns.find((column) => column.id === ana);
    const borisColumn = model.columns.find((column) => column.id === boris);
    expect(anaColumn?.closed).toBe(false);
    expect(anaColumn?.breaks).toHaveLength(1);
    expect(anaColumn?.lines.some((line) => line.minute === 12 * 60)).toBe(false);
    expect(anaColumn?.lines.some((line) => line.minute === 13 * 60)).toBe(true);
    expect(borisColumn?.closed).toBe(true);
    expect(borisColumn?.lines).toEqual([]);
    const anaHtml = html.slice(
      html.indexOf('aria-label="Petak, 23. 10., Ana Anić"'),
      html.indexOf('aria-label="Petak, 23. 10., Boris Borić"'),
    );
    const borisHtml = html.slice(html.indexOf('aria-label="Petak, 23. 10., Boris Borić"'));
    expect(anaHtml).toContain("Pauza");
    expect(anaHtml).toContain("calendar-grid__line");
    expect(anaHtml).not.toContain("Zatvoreno");
    expect(borisHtml).toContain("Zatvoreno");
    expect(borisHtml).not.toContain("calendar-grid__line");

    const oneDentist = dayFromRows({
      datum,
      members: members.filter((member) => member.id === ana),
      appointments,
      patients,
      hours,
    });
    expect(oneDentist).not.toBeNull();
    if (oneDentist) {
      const alone = renderToStaticMarkup(<DayGrid model={oneDentist} />);
      expect(alone).toContain("Petak");
      expect(alone).toContain("23. 10.");
      expect(alone).not.toContain("Ana Anić");
    }
    expect(html).not.toContain("Rade Radić");
    expect(html).toContain("Mika Mikić");
    expect(hoursList).not.toContain(hourLabel(8));
    expect(hoursList.indexOf(hourLabel(9))).toBeGreaterThanOrEqual(0);
    expect(hoursList.indexOf(hourLabel(9))).toBeLessThan(hoursList.indexOf(hourLabel(10)));
    expect(hoursList).not.toContain(hourLabel(7));
    expect(tops.length).toBeGreaterThan(2);
    for (let index = 1; index < tops.length; index += 1) {
      expect(tops[index]).toBeGreaterThan(tops[index - 1] ?? 0);
    }
    for (const status of CALENDAR_APPOINTMENT_STATUSES) {
      expect(html).toContain(`data-status="${status}"`);
    }
    expect(html).not.toContain('data-status="pending_confirmation"');
    expect(html).not.toContain('data-status="offered"');

    const blockStart = cssSource.indexOf("/* calendar-grid */");
    expect(blockStart).toBeGreaterThanOrEqual(0);
    const block = cssSource.slice(blockStart);
    expect(block).toContain("overflow-x: auto");
    expect(block).toContain("position: sticky");
    expect(block).toContain("left: 0");
    expect(block).toContain("flex-direction: column");
    expect(block).toContain("text-decoration: line-through");
    expect(block).toContain('[data-hide-cancelled="true"] [data-status="cancelled"]');
    expect(block).toContain(".calendar-grid__now");
    expect(block).toContain("var(--primary)");
    expect(gridSource).toContain("<NowLine");
    expect(gridSource).toContain("dates={[model.datum]}");
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    for (const status of APPOINTMENT_STATUSES) {
      expect(block).toContain(`[data-status="${status}"]`);
    }
    for (const token of ["--primary", "--secondary", "--muted", "--destructive", "--muted-foreground", "--card"]) {
      expect(block).toContain(`var(${token})`);
    }

    expect(gridSource).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(gridSource).not.toContain("line-through");
    expect(pageSource).toContain("loadDayCalendar");
    expect(readFileSync(path.join(process.cwd(), "app/danas/load-day.ts"), "utf8")).toContain(
      "CALENDAR_APPOINTMENT_STATUSES",
    );
    expect(pageSource).toContain("DayGrid");
    expect(pageSource).not.toContain("query.sakrijOtkazane");
    expect(shellSource).toContain("data-hide-cancelled");
    expect(pageSource.toLowerCase()).not.toContain("supabase");
    expect(shellSource).toContain('query.prikaz === "dan"');
    expect(shellSource).toContain("dayCalendar");
    expect(shellSource.toLowerCase()).not.toContain("supabase");
  });
});
