import {
  BELGRADE_TIME_ZONE,
  belgradeLocalToDate,
  formatBelgrade,
} from "@/lib/calendar-dates";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const MONTH_PARAM = /^(\d{4})-(\d{2})$/;

const ACTIVE_STATUSES = new Set([
  "pending_confirmation",
  "offered",
  "scheduled",
  "completed",
  "no_show",
]);

export type DentistMonthStatistics = {
  dentistId: string;
  name: string;
  appointments: number;
  newPatients: number;
  noShows: number;
};

export type ClinicStatistics =
  | { status: "ready"; month: string; rows: DentistMonthStatistics[] }
  | { status: "unavailable" };

export function resolveStatisticsMonth(mesec: string | undefined, now: Date = new Date()): string {
  if (typeof mesec === "string") {
    const match = MONTH_PARAM.exec(mesec);
    if (match) {
      const month = Number(match[2]);
      if (month >= 1 && month <= 12) {
        return `${match[1]}-${match[2]}`;
      }
    }
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BELGRADE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

export function belgradeMonthRange(monthYm: string): { start: Date; end: Date } {
  const match = MONTH_PARAM.exec(monthYm);
  if (!match) {
    throw new RangeError(`Invalid month ${monthYm}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const start = belgradeLocalToDate({ year, month, day: 1, hour: 0, minute: 0, second: 0 });
  const end =
    month === 12
      ? belgradeLocalToDate({ year: year + 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 })
      : belgradeLocalToDate({ year, month: month + 1, day: 1, hour: 0, minute: 0, second: 0 });
  return { start, end };
}

export function formatStatisticsMonthLabel(monthYm: string): string {
  const { start } = belgradeMonthRange(monthYm);
  return formatBelgrade(start, { month: "long", year: "numeric" });
}

type DentistRow = {
  id: string;
  first_name: string;
  last_name: string;
};

type AppointmentRow = {
  dentist_id: string;
  patient_id: string | null;
  status: string;
  starts_at: string;
};

/** Owner-only clinic numbers for /statistika. Platform admin has no matching query. */
export async function loadClinicStatistics(
  clinicId: string,
  monthYm: string,
): Promise<ClinicStatistics> {
  const { start, end } = belgradeMonthRange(monthYm);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const supabase = await createSupabaseServerClient();

  const [dentistsResult, monthAppointmentsResult] = await Promise.all([
    supabase
      .from("clinic_members")
      .select("id, first_name, last_name")
      .eq("clinic_id", clinicId)
      .eq("sees_patients", true)
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true }),
    supabase
      .from("appointments")
      .select("dentist_id, patient_id, status, starts_at")
      .eq("clinic_id", clinicId)
      .gte("starts_at", startIso)
      .lt("starts_at", endIso)
      .neq("status", "cancelled"),
  ]);

  if (dentistsResult.error || monthAppointmentsResult.error) {
    console.error(
      "loadClinicStatistics failed:",
      dentistsResult.error?.message ?? monthAppointmentsResult.error?.message,
    );
    return { status: "unavailable" };
  }

  const dentists = (dentistsResult.data ?? []) as DentistRow[];
  const monthAppointments = (monthAppointmentsResult.data ?? []) as AppointmentRow[];

  const patientIds = [
    ...new Set(
      monthAppointments
        .map((row) => row.patient_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];

  const priorPairs = new Set<string>();
  if (patientIds.length > 0) {
    const priorResult = await supabase
      .from("appointments")
      .select("dentist_id, patient_id")
      .eq("clinic_id", clinicId)
      .lt("starts_at", startIso)
      .neq("status", "cancelled")
      .in("patient_id", patientIds);

    if (priorResult.error) {
      console.error("loadClinicStatistics prior appointments failed:", priorResult.error.message);
      return { status: "unavailable" };
    }

    for (const row of priorResult.data ?? []) {
      if (typeof row.dentist_id === "string" && typeof row.patient_id === "string") {
        priorPairs.add(pairKey(row.dentist_id, row.patient_id));
      }
    }
  }

  const counts = new Map<
    string,
    { appointments: number; newPatients: number; noShows: number }
  >();
  for (const dentist of dentists) {
    counts.set(dentist.id, { appointments: 0, newPatients: 0, noShows: 0 });
  }

  const newPatientPairs = new Set<string>();

  for (const row of monthAppointments) {
    if (!ACTIVE_STATUSES.has(row.status)) {
      continue;
    }
    const bucket = counts.get(row.dentist_id);
    if (!bucket) {
      continue;
    }
    bucket.appointments += 1;
    if (row.status === "no_show") {
      bucket.noShows += 1;
    }
    if (typeof row.patient_id === "string" && row.patient_id.length > 0) {
      const key = pairKey(row.dentist_id, row.patient_id);
      if (!priorPairs.has(key) && !newPatientPairs.has(key)) {
        newPatientPairs.add(key);
        bucket.newPatients += 1;
      }
    }
  }

  const rows: DentistMonthStatistics[] = dentists.map((dentist) => {
    const bucket = counts.get(dentist.id) ?? { appointments: 0, newPatients: 0, noShows: 0 };
    return {
      dentistId: dentist.id,
      name: `${dentist.first_name} ${dentist.last_name}`.trim(),
      appointments: bucket.appointments,
      newPatients: bucket.newPatients,
      noShows: bucket.noShows,
    };
  });

  return { status: "ready", month: monthYm, rows };
}

function pairKey(dentistId: string, patientId: string): string {
  return `${dentistId}:${patientId}`;
}
