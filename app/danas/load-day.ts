import { z } from "zod";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { isIsoDate, isoDayOfWeek, startOfBelgradeDay, startOfNextBelgradeDay } from "@/lib/calendar-dates";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { dayFromRows, type DayGridModel } from "./day-calendar";

const DAY_UNAVAILABLE = "Kalendar trenutno nije dostupan. Pokušajte ponovo.";

export async function loadDayCalendar(
  clinicId: string,
  datum: string,
  hideCancelled: boolean,
): Promise<ActionResult<DayGridModel>> {
  if (!z.string().uuid().safeParse(clinicId).success || !isIsoDate(datum)) {
    return fail(DAY_UNAVAILABLE);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const start = startOfBelgradeDay(datum).toISOString();
    const end = startOfNextBelgradeDay(datum).toISOString();
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
        .select("clinic_member_id, is_closed, opens_at, closes_at")
        .eq("clinic_id", clinicId)
        .eq("iso_dow", isoDayOfWeek(datum)),
    ]);

    if (membersResult.error || appointmentsResult.error || hoursResult.error) {
      console.error(
        "load_day_calendar rejected:",
        membersResult.error?.code ?? appointmentsResult.error?.code ?? hoursResult.error?.code ?? "unknown",
      );
      return fail(DAY_UNAVAILABLE);
    }

    const patientIds = uniquePatientIds(appointmentsResult.data ?? []);
    const patientsResult =
      patientIds.length > 0
        ? await supabase.from("patients").select("id, first_name, last_name").in("id", patientIds)
        : { data: [], error: null };

    if (patientsResult.error) {
      console.error("load_day_calendar rejected:", patientsResult.error.code);
      return fail(DAY_UNAVAILABLE);
    }

    const model = dayFromRows({
      datum,
      hideCancelled,
      members: membersResult.data ?? [],
      appointments: appointmentsResult.data ?? [],
      patients: patientsResult.data ?? [],
      hours: hoursResult.data ?? [],
    });
    if (!model) {
      return fail(DAY_UNAVAILABLE);
    }
    return ok(model);
  } catch (error) {
    console.error("load_day_calendar failed:", error instanceof Error ? error.name : "unknown");
    return fail(DAY_UNAVAILABLE);
  }
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
