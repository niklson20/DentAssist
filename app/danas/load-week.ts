import { z } from "zod";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import {
  addCalendarDays,
  formatBelgrade,
  formatBelgradeDate,
  isIsoDate,
  startOfBelgradeDay,
  startOfBelgradeWeek,
  startOfNextBelgradeDay,
  type CalendarQuery,
} from "@/lib/calendar-dates";
import { APPOINTMENT_STATUSES, appointmentStatusLabel } from "@/lib/labels";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { WeekDay, WeekModel, WeekVisit } from "./week-view";

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
  dentistId: string | null;
  hideCancelled: boolean;
  members: unknown;
  appointments: unknown;
  patients: unknown;
}): WeekModel | null {
  const members = parseRows(input.members, memberSchema);
  const appointments = parseRows(input.appointments, appointmentSchema);
  const patients = parseRows(input.patients, patientSchema);
  if (!members || !appointments || !patients) {
    return null;
  }

  const dentist = oneDentist(seeingDentists(members), input.dentistId);
  if (!dentist) {
    return { dentistId: null, dentistName: null, days: [] };
  }

  const names = new Map(patients.map((patient) => [patient.id, `${patient.first_name} ${patient.last_name}`]));
  const visits = appointments.filter(
    (row) => row.dentist_id === dentist.id && !(input.hideCancelled && row.status === "cancelled"),
  );
  const days: WeekDay[] = weekDates(input.datum).map((datum) => ({
    datum,
    visits: visitsOn(datum, visits, names),
  }));

  return { dentistId: dentist.id, dentistName: dentist.name, days };
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
    const [membersResult, appointmentsResult] = await Promise.all([
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
    ]);

    if (membersResult.error || appointmentsResult.error) {
      console.error(
        "load_week_calendar rejected:",
        membersResult.error?.code ?? appointmentsResult.error?.code ?? "unknown",
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
      dentistId: query.stomatolog,
      hideCancelled: query.sakrijOtkazane,
      members: membersResult.data ?? [],
      appointments: appointmentsResult.data ?? [],
      patients: patientsResult.data ?? [],
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

function visitsOn(datum: string, visits: AppointmentRow[], names: Map<string, string>): WeekVisit[] {
  return visits
    .filter((visit) => formatBelgradeDate(new Date(visit.starts_at)) === datum)
    .sort((left, right) => Date.parse(left.starts_at) - Date.parse(right.starts_at) || left.id.localeCompare(right.id))
    .map((visit) => ({
      id: visit.id,
      status: visit.status,
      label: (visit.patient_id && names.get(visit.patient_id)) || appointmentStatusLabel(visit.status),
      timeLabel: timeLabel(visit.starts_at, visit.ends_at),
    }));
}

function timeLabel(startsAt: string, endsAt: string): string {
  const start = formatBelgrade(new Date(startsAt), { hour: "2-digit", minute: "2-digit" });
  const end = formatBelgrade(new Date(endsAt), { hour: "2-digit", minute: "2-digit" });
  return `${start}–${end}`;
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
