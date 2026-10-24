import { z } from "zod";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import {
  addCalendarDays,
  formatBelgrade,
  formatBelgradeDate,
  formatYmd,
  isIsoDate,
  isoDayOfWeek,
  parseIsoDate,
  startOfBelgradeDay,
  startOfBelgradeWeek,
  startOfNextBelgradeDay,
  type CalendarQuery,
} from "@/lib/calendar-dates";
import { APPOINTMENT_STATUSES } from "@/lib/labels";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { closedDows, schedulesFromRows } from "./day-calendar";
import type { MonthModel } from "./month-view";
import { calendarPath } from "./schema";

const MONTH_UNAVAILABLE = "Kalendar trenutno nije dostupan. Pokušajte ponovo.";

const instant = z.string().refine((value) => Number.isFinite(Date.parse(value)));

const memberSchema = z
  .object({
    id: z.string().uuid(),
    first_name: z.string().trim().min(1).max(80),
    last_name: z.string().trim().min(1).max(80),
    sees_patients: z.boolean(),
  })
  .strip();

const appointmentSchema = z
  .object({
    id: z.string().uuid(),
    dentist_id: z.string().uuid(),
    patient_id: z.string().uuid().nullable(),
    starts_at: instant,
    ends_at: instant,
    status: z.enum(APPOINTMENT_STATUSES),
  })
  .strip()
  .refine((row) => Date.parse(row.ends_at) > Date.parse(row.starts_at));

type MemberRow = z.infer<typeof memberSchema>;

export function terminCountLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return `${count} termin`;
  }
  return `${count} termina`;
}

export function monthDates(isoDate: string): string[] {
  const { year, month } = parseIsoDate(isoDate);
  const first = formatYmd({ year, month, day: 1 });
  const next =
    month === 12 ? formatYmd({ year: year + 1, month: 1, day: 1 }) : formatYmd({ year, month: month + 1, day: 1 });
  const last = addCalendarDays(next, -1);
  const start = startOfBelgradeWeek(first);
  const end = addCalendarDays(startOfBelgradeWeek(last), 6);
  const dates: string[] = [];
  for (let cursor = start; cursor <= end && dates.length < 42; cursor = addCalendarDays(cursor, 1)) {
    dates.push(cursor);
  }
  return dates;
}

export function monthFromRows(input: {
  query: CalendarQuery;
  today: string;
  members: unknown;
  appointments: unknown;
  hours: unknown;
}): MonthModel | null {
  const members = parseRows(input.members, memberSchema);
  const appointments = parseRows(input.appointments, appointmentSchema);
  const schedules = schedulesFromRows(input.hours);
  if (!members || !appointments || !schedules) {
    return null;
  }

  const dates = monthDates(input.query.datum);
  const monthKey = monthKeyOf(input.query.datum);
  const dentist = oneDentist(seeingDentists(members), input.query.stomatolog);
  const closed = dentist ? closedDows(schedules, dentist.id) : null;
  const dentistIds = new Set(countedDentists(members, input.query.stomatolog));
  const counts = new Map<string, number>();
  for (const row of appointments) {
    if (!dentistIds.has(row.dentist_id)) {
      continue;
    }
    if (input.query.sakrijOtkazane && row.status === "cancelled") {
      continue;
    }
    const datum = formatBelgradeDate(new Date(row.starts_at));
    counts.set(datum, (counts.get(datum) ?? 0) + 1);
  }

  return {
    title: monthTitle(input.query.datum),
    anchor: input.query.datum,
    today: input.today,
    days: dates.map((datum) => {
      const count = counts.get(datum) ?? 0;
      return {
        datum,
        inMonth: datum.slice(0, 7) === monthKey,
        closed: closed?.has(isoDayOfWeek(datum)) ?? false,
        today: datum === input.today,
        anchor: datum === input.query.datum,
        count,
        countLabel: terminCountLabel(count),
        href: calendarPath(input.query, { prikaz: "dan", datum }),
      };
    }),
  };
}

export async function loadMonthCalendar(clinicId: string, query: CalendarQuery): Promise<ActionResult<MonthModel>> {
  if (!z.string().uuid().safeParse(clinicId).success || !isIsoDate(query.datum)) {
    return fail(MONTH_UNAVAILABLE);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const dates = monthDates(query.datum);
    const first = dates[0];
    const last = dates[dates.length - 1];
    if (!first || !last) {
      return fail(MONTH_UNAVAILABLE);
    }
    const start = startOfBelgradeDay(first).toISOString();
    const end = startOfNextBelgradeDay(last).toISOString();
    const [membersResult, appointmentsResult, hoursResult] = await Promise.all([
      supabase
        .from("clinic_members")
        .select("id, first_name, last_name, sees_patients")
        .eq("clinic_id", clinicId)
        .order("last_name", { ascending: true })
        .order("first_name", { ascending: true }),
      supabase
        .from("appointments")
        .select("id, dentist_id, patient_id, starts_at, ends_at, status")
        .eq("clinic_id", clinicId)
        .gte("starts_at", start)
        .lt("starts_at", end),
      supabase
        .from("working_hours")
        .select("clinic_member_id, iso_dow, is_closed, opens_at, closes_at, break_starts_at, break_ends_at")
        .eq("clinic_id", clinicId),
    ]);

    if (membersResult.error || appointmentsResult.error || hoursResult.error) {
      console.error(
        "load_month_calendar rejected:",
        membersResult.error?.code ?? appointmentsResult.error?.code ?? hoursResult.error?.code ?? "unknown",
      );
      return fail(MONTH_UNAVAILABLE);
    }

    const model = monthFromRows({
      query,
      today: formatBelgradeDate(new Date()),
      members: membersResult.data ?? [],
      appointments: appointmentsResult.data ?? [],
      hours: hoursResult.data ?? [],
    });
    if (!model) {
      return fail(MONTH_UNAVAILABLE);
    }
    return ok(model);
  } catch (error) {
    console.error("load_month_calendar failed:", error instanceof Error ? error.name : "unknown");
    return fail(MONTH_UNAVAILABLE);
  }
}

function seeingDentists(members: MemberRow[]): { id: string; name: string }[] {
  return members
    .filter((member) => member.sees_patients)
    .map((member) => ({
      id: member.id,
      name: `${member.first_name} ${member.last_name}`,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "sr") || left.id.localeCompare(right.id));
}

function oneDentist(
  dentists: { id: string; name: string }[],
  dentistId: string | null,
): { id: string; name: string } | null {
  if (dentistId) {
    const chosen = dentists.find((dentist) => dentist.id === dentistId);
    if (chosen) {
      return chosen;
    }
  }
  return dentists[0] ?? null;
}

function countedDentists(members: MemberRow[], dentistId: string | null): string[] {
  const dentists = members.filter((member) => member.sees_patients).map((member) => member.id);
  if (!dentistId) {
    return dentists;
  }
  return dentists.filter((id) => id === dentistId);
}

function monthKeyOf(isoDate: string): string {
  const { year, month } = parseIsoDate(isoDate);
  return formatYmd({ year, month, day: 1 }).slice(0, 7);
}

function monthTitle(isoDate: string): string {
  const label = formatBelgrade(startOfBelgradeDay(isoDate), { month: "long", year: "numeric" });
  return label.charAt(0).toLocaleUpperCase("sr-Latn") + label.slice(1);
}

function parseRows<T>(rows: unknown, schema: z.ZodType<T>): T[] | null {
  if (!Array.isArray(rows)) {
    return null;
  }
  const parsed: T[] = [];
  for (const row of rows) {
    const result = schema.safeParse(row);
    if (result.success) {
      parsed.push(result.data);
    }
  }
  return parsed;
}
