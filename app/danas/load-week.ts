import { z } from "zod";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import {
  addCalendarDays,
  formatBelgradeDate,
  isIsoDate,
  isoDayOfWeek,
  startOfBelgradeDay,
  startOfBelgradeWeek,
  startOfNextBelgradeDay,
  type CalendarQuery,
} from "@/lib/calendar-dates";
import { APPOINTMENT_STATUSES, appointmentStatusLabel } from "@/lib/labels";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  axisBounds,
  hourMarks,
  layoutLane,
  memberHasSavedHours,
  scheduleOn,
  schedulesFromRows,
  slotStep,
} from "./day-calendar";
import type { WeekDay, WeekModel } from "./week-view";

const WEEK_UNAVAILABLE = "Kalendar trenutno nije dostupan. Pokušajte ponovo.";

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

const patientSchema = z
  .object({
    id: z.string().uuid(),
    first_name: z.string().trim().min(1).max(80),
    last_name: z.string().trim().min(1).max(80),
  })
  .strip();

type MemberRow = z.infer<typeof memberSchema>;
type AppointmentRow = z.infer<typeof appointmentSchema>;

type Dentist = { id: string; name: string };

export function weekDates(isoDate: string): string[] {
  const monday = startOfBelgradeWeek(isoDate);
  return [0, 1, 2, 3, 4, 5, 6].map((offset) => addCalendarDays(monday, offset));
}

export function weekFromRows(input: {
  datum: string;
  today: string;
  dentistId: string | null;
  slotMinutes?: number;
  members: unknown;
  appointments: unknown;
  patients: unknown;
  hours: unknown;
}): WeekModel | null {
  const members = parseRows(input.members, memberSchema);
  const appointments = parseRows(input.appointments, appointmentSchema);
  const patients = parseRows(input.patients, patientSchema);
  const schedules = schedulesFromRows(input.hours);
  if (!members || !appointments || !patients || !schedules) {
    return null;
  }

  const dentist = oneDentist(seeingDentists(members), input.dentistId);
  if (!dentist) {
    return { dentistId: null, dentistName: null, today: input.today, span: 0, hours: [], days: [] };
  }

  const names = new Map(patients.map((patient) => [patient.id, `${patient.first_name} ${patient.last_name}`]));
  const visits = appointments.filter((row) => row.dentist_id === dentist.id);
  const dates = weekDates(input.datum);
  const anySaved = memberHasSavedHours(schedules, dentist.id);
  const byDay = dates.map((datum) => ({
    datum,
    schedule: scheduleOn(schedules, dentist.id, isoDayOfWeek(datum)),
    visits: visitsOn(datum, visits, names),
  }));
  const axis = axisBounds({
    saved: anySaved,
    schedules: byDay.flatMap((day) => (day.schedule ? [day.schedule] : [])),
    visits: byDay.flatMap((day) => day.visits),
  });
  const span = axis.empty ? 0 : axis.endHour - axis.startHour;
  const step = slotStep(input.slotMinutes);
  const days: WeekDay[] = byDay.map((day) => ({
    datum: day.datum,
    ...layoutLane({
      schedule: day.schedule,
      anySaved,
      startHour: axis.startHour,
      endHour: axis.endHour,
      slotMinutes: step,
      visits: day.visits,
    }),
  }));

  return {
    dentistId: dentist.id,
    dentistName: dentist.name,
    today: input.today,
    span,
    hours: axis.empty ? [] : hourMarks(dates[0] ?? input.datum, axis.startHour, axis.endHour),
    days,
  };
}

export async function loadWeekCalendar(clinicId: string, query: CalendarQuery): Promise<ActionResult<WeekModel>> {
  if (!z.string().uuid().safeParse(clinicId).success || !isIsoDate(query.datum)) {
    return fail(WEEK_UNAVAILABLE);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const monday = startOfBelgradeWeek(query.datum);
    const start = startOfBelgradeDay(monday).toISOString();
    const end = startOfNextBelgradeDay(addCalendarDays(monday, 6)).toISOString();
    const [membersResult, appointmentsResult, hoursResult, clinicResult] = await Promise.all([
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
      supabase.from("clinics").select("slot_minutes").eq("id", clinicId).maybeSingle(),
    ]);

    if (membersResult.error || appointmentsResult.error || hoursResult.error || clinicResult.error) {
      console.error(
        "load_week_calendar rejected:",
        membersResult.error?.code ??
          appointmentsResult.error?.code ??
          hoursResult.error?.code ??
          clinicResult.error?.code ??
          "unknown",
      );
      return fail(WEEK_UNAVAILABLE);
    }

    const patientIds = uniquePatientIds(appointmentsResult.data ?? []);
    const patientsResult =
      patientIds.length > 0
        ? await supabase.from("patients").select("id, first_name, last_name").in("id", patientIds)
        : { data: [], error: null };

    if (patientsResult.error) {
      console.error("load_week_calendar rejected:", patientsResult.error.code);
      return fail(WEEK_UNAVAILABLE);
    }

    const model = weekFromRows({
      datum: query.datum,
      today: formatBelgradeDate(new Date()),
      dentistId: query.stomatolog,
      slotMinutes: slotStep(clinicResult.data?.slot_minutes),
      members: membersResult.data ?? [],
      appointments: appointmentsResult.data ?? [],
      patients: patientsResult.data ?? [],
      hours: hoursResult.data ?? [],
    });
    if (!model) {
      return fail(WEEK_UNAVAILABLE);
    }
    return ok(model);
  } catch (error) {
    console.error("load_week_calendar failed:", error instanceof Error ? error.name : "unknown");
    return fail(WEEK_UNAVAILABLE);
  }
}

function seeingDentists(members: MemberRow[]): Dentist[] {
  return members
    .filter((member) => member.sees_patients)
    .map((member) => ({
      id: member.id,
      name: `${member.first_name} ${member.last_name}`,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "sr") || left.id.localeCompare(right.id));
}

function oneDentist(dentists: Dentist[], dentistId: string | null): Dentist | null {
  if (dentistId) {
    const chosen = dentists.find((dentist) => dentist.id === dentistId);
    if (chosen) {
      return chosen;
    }
  }
  return dentists[0] ?? null;
}

function visitsOn(datum: string, visits: AppointmentRow[], names: Map<string, string>) {
  return visits
    .filter((visit) => formatBelgradeDate(new Date(visit.starts_at)) === datum)
    .sort((left, right) => Date.parse(left.starts_at) - Date.parse(right.starts_at) || left.id.localeCompare(right.id))
    .map((visit) => ({
      id: visit.id,
      dentistId: visit.dentist_id,
      status: visit.status,
      startsAt: visit.starts_at,
      endsAt: visit.ends_at,
      label: (visit.patient_id && names.get(visit.patient_id)) || appointmentStatusLabel(visit.status),
    }));
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

function uniquePatientIds(rows: unknown[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== "object" || !("patient_id" in row)) {
      continue;
    }
    const patientId = row.patient_id;
    if (typeof patientId === "string") {
      ids.add(patientId);
    }
  }
  return [...ids];
}
