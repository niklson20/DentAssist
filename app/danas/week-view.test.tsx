import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { belgradeLocalToISO } from "@/lib/calendar-dates";
import { CALENDAR_APPOINTMENT_STATUSES, type AppointmentStatus } from "@/lib/labels";

import { weekFromRows } from "./load-week";
import { WeekView } from "./week-view";

const datum = "2026-06-08";
const ana = "11111111-1111-4111-8111-111111111111";
const boris = "22222222-2222-4222-8222-222222222222";
const reception = "33333333-3333-4333-8333-333333333333";
const mika = "44444444-4444-4444-8444-444444444444";
const pera = "55555555-5555-4555-8555-555555555555";
const van = "66666666-6666-4666-8666-666666666666";
const kraj = "77777777-7777-4777-8777-777777777777";
const otkaz = "88888888-8888-4888-8888-888888888888";

const week = [
  "2026-06-08",
  "2026-06-09",
  "2026-06-10",
  "2026-06-11",
  "2026-06-12",
  "2026-06-13",
  "2026-06-14",
];

const weekdays = ["Ponedeljak", "Utorak", "Sreda", "Četvrtak", "Petak", "Subota", "Nedelja"];

const viewSource = readFileSync(path.join(process.cwd(), "app/danas/week-view.tsx"), "utf8");
const cssSource = readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");
const loadSource = readFileSync(path.join(process.cwd(), "app/danas/load-week.ts"), "utf8");
const pageSource = readFileSync(path.join(process.cwd(), "app/danas/page.tsx"), "utf8");
const shellSource = readFileSync(path.join(process.cwd(), "app/danas/calendar-shell.tsx"), "utf8");

function at(day: number, hour: number, minute = 0): string {
  return belgradeLocalToISO({ year: 2026, month: 6, day, hour, minute });
}

function visit(
  id: string,
  dentistId: string,
  status: AppointmentStatus,
  day: number,
  hour: number,
  patientId: string | null = null,
) {
  return {
    id,
    dentist_id: dentistId,
    patient_id: patientId,
    starts_at: at(day, hour),
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
  visit("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", ana, "scheduled", 7, 9, van),
  visit("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", ana, "pending_confirmation", 8, 8),
  visit("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3", ana, "offered", 9, 9),
  visit("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4", ana, "scheduled", 10, 10, mika),
  visit("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5", ana, "completed", 11, 11),
  visit("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6", ana, "no_show", 12, 12),
  visit("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7", ana, "cancelled", 13, 13, otkaz),
  visit("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8", ana, "scheduled", 14, 14, kraj),
  visit("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9", boris, "scheduled", 8, 15, pera),
  visit("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab", ana, "scheduled", 15, 9, pera),
];

const patients = [
  { id: mika, first_name: "Mika", last_name: "Mikić" },
  { id: pera, first_name: "Pera", last_name: "Perić" },
  { id: van, first_name: "Van", last_name: "Opsega" },
  { id: kraj, first_name: "Kraj", last_name: "Perioda" },
  { id: otkaz, first_name: "Otkaz", last_name: "Sakriven" },
];

describe("week view", () => {
  it("shows one dentist and seven days from Monday", () => {
    const input = {
      datum,
      today: "2026-06-08",
      dentistId: ana,
      slotMinutes: 15,
      members,
      appointments,
      patients,
      hours: [1, 2, 3, 4, 5, 6, 7].map((dow) => ({
        clinic_member_id: ana,
        iso_dow: dow,
        is_closed: dow >= 6,
        opens_at: dow >= 6 ? null : "09:00:00",
        closes_at: dow >= 6 ? null : "17:00:00",
        break_starts_at: dow >= 6 ? null : "13:00:00",
        break_ends_at: dow >= 6 ? null : "13:30:00",
      })),
    };
    const model = weekFromRows(input);
    expect(model).not.toBeNull();
    if (!model) {
      return;
    }

    expect(model.dentistId).toBe(ana);
    expect(model.dentistName).toBe("Ana Anić");
    expect(model.days.map((day) => day.datum)).toEqual(week);
    expect(weekFromRows({ ...input, datum: "2026-06-10" })?.days.map((day) => day.datum)).toEqual(week);
    expect(weekFromRows({ ...input, dentistId: null })?.dentistName).toBe("Ana Anić");

    const html = renderToStaticMarkup(<WeekView model={model} />);
    const dates = [...html.matchAll(/data-datum="(\d{4}-\d{2}-\d{2})"/g)].map((match) => match[1]);
    expect(dates).toEqual(week);
    expect(html).not.toContain("Ana Anić");
    expect(html).not.toContain(`data-dentist="${ana}"`);
    expect(html).not.toContain("Boris");
    expect(html).not.toContain("Rade");
    expect(html).not.toContain(boris);
    expect(html).toContain("Mika Mikić");
    expect(html).toContain("Kraj Perioda");
    expect(html).not.toContain("Van Opsega");
    expect(html).not.toContain("Pera Perić");
    expect(html).toContain("Otkaz Sakriven");
    expect(html).toContain('data-status="cancelled"');
    expect(html).not.toContain("2026-06-07");
    expect(html).not.toContain("2026-06-15");

    let cursor = -1;
    for (const weekday of weekdays) {
      const atIndex = html.indexOf(weekday);
      expect(atIndex).toBeGreaterThan(cursor);
      cursor = atIndex;
    }
    for (const status of CALENDAR_APPOINTMENT_STATUSES) {
      expect(html).toContain(`data-status="${status}"`);
    }
    expect(html).not.toContain('data-status="pending_confirmation"');
    expect(html).not.toContain('data-status="offered"');
    expect(html).toContain("PON");
    expect(html).toContain("NED");
    expect(html.match(/data-current="true"/g)).toHaveLength(1);
    expect(html.indexOf('data-current="true"')).toBeLessThan(html.indexOf("UTO"));
    const saturday = html.slice(html.indexOf('data-datum="2026-06-13"'), html.indexOf('data-datum="2026-06-14"'));
    expect(saturday).toContain('data-closed="true"');
    expect(saturday).toContain("Zatvoreno");
    expect(saturday).not.toContain("calendar-grid__line");
    expect(html).toContain("Pauza");
    expect(html).toContain("Kraj Perioda");
    const monday = html.slice(html.indexOf('data-datum="2026-06-08"'), html.indexOf('data-datum="2026-06-09"'));
    const mondayLines = monday.match(/class="calendar-grid__line"/g) ?? [];
    const mondayHours = monday.match(/data-hour="true"/g) ?? [];
    expect(mondayLines.length).toBeGreaterThan(0);
    expect(mondayHours).toHaveLength(mondayLines.length);
    expect(monday).toContain("calendar-grid__hourband");
    expect(monday).toContain('data-alt="true"');
    expect(cssSource).toContain(".calendar-grid__hourband");
    expect(cssSource).toContain("height: 2px");
    expect(viewSource).toContain("slotLines={false}");
    expect(viewSource).toContain("dates={model.days.map((day) => day.datum)}");
    expect(cssSource).toContain(".calendar-grid__now");
    expect(cssSource).toContain('[data-hide-cancelled="true"] [data-status="cancelled"]');
    expect(cssSource).toContain("text-decoration: line-through");

    expect(loadSource).toContain("startOfBelgradeWeek(isoDate)");
    expect(loadSource).toContain("CALENDAR_APPOINTMENT_STATUSES");
    expect(viewSource).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(viewSource.toLowerCase()).not.toContain("supabase");
    expect(pageSource).toContain("loadWeekCalendar");
    expect(pageSource).toContain("WeekView");
    expect(pageSource).toContain('query.prikaz === "nedelja"');
    expect(pageSource.toLowerCase()).not.toContain("supabase");
    expect(shellSource).toContain("weekCalendar");
    expect(shellSource).toContain('query.prikaz === "nedelja"');
    expect(shellSource.toLowerCase()).not.toContain("supabase");
    expect(shellSource).not.toContain("#");
  });
});
