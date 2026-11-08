import type { AppointmentStatus } from "@/lib/labels";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { APPOINTMENTS_UNAVAILABLE, profileAppointmentRowSchema } from "./schema";

export type ProfileAppointment = {
  appointmentId: string;
  startsAt: string;
  endsAt: string;
  clinicName: string;
  dentistName: string;
  status: AppointmentStatus;
  clinicRating: number | null;
  dentistRating: number | null;
};

export async function loadProfileAppointments(): Promise<ActionResult<ProfileAppointment[]>> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("list_my_appointments_all");

    if (error || (data != null && !Array.isArray(data))) {
      console.error("list_my_appointments_all rejected:", error?.code ?? "rejected");
      return fail(APPOINTMENTS_UNAVAILABLE);
    }

    return ok(profileAppointmentsFrom(data ?? []));
  } catch (loadError) {
    console.error(
      "list_my_appointments_all failed:",
      loadError instanceof Error ? loadError.name : "unknown",
    );
    return fail(APPOINTMENTS_UNAVAILABLE);
  }
}

export function profileAppointmentsFrom(rows: unknown): ProfileAppointment[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  const appointments: ProfileAppointment[] = [];
  for (const row of rows) {
    const parsed = profileAppointmentRowSchema.safeParse(row);
    if (!parsed.success) {
      continue;
    }
    appointments.push({
      appointmentId: parsed.data.appointment_id,
      startsAt: parsed.data.starts_at,
      endsAt: parsed.data.ends_at,
      clinicName: parsed.data.clinic_name,
      dentistName: `${parsed.data.dentist_first_name} ${parsed.data.dentist_last_name}`,
      status: parsed.data.status,
      clinicRating: parsed.data.clinic_rating,
      dentistRating: parsed.data.dentist_rating,
    });
  }

  return appointments.sort(
    (left, right) =>
      Date.parse(right.startsAt) - Date.parse(left.startsAt) ||
      left.clinicName.localeCompare(right.clinicName, "sr") ||
      left.dentistName.localeCompare(right.dentistName, "sr"),
  );
}
