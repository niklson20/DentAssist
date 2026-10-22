import type { AppointmentStatus } from "@/lib/labels";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { APPOINTMENTS_UNAVAILABLE, appointmentRowSchema, clinicSlugSchema } from "./schema";

export type MyAppointment = {
  startsAt: string;
  endsAt: string;
  dentistName: string;
  status: AppointmentStatus;
};

export async function loadMyAppointments(slug: string): Promise<ActionResult<MyAppointment[]>> {
  const parsedSlug = clinicSlugSchema.safeParse(slug);
  if (!parsedSlug.success) {
    return fail(APPOINTMENTS_UNAVAILABLE);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("list_my_appointments", {
      slug: parsedSlug.data,
    });

    if (error || (data != null && !Array.isArray(data))) {
      console.error("list_my_appointments rejected:", error?.code ?? "rejected");
      return fail(APPOINTMENTS_UNAVAILABLE);
    }

    return ok(appointmentsFrom(data ?? []));
  } catch (loadError) {
    console.error(
      "list_my_appointments failed:",
      loadError instanceof Error ? loadError.name : "unknown",
    );
    return fail(APPOINTMENTS_UNAVAILABLE);
  }
}

export function appointmentsFrom(rows: unknown): MyAppointment[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  const appointments: MyAppointment[] = [];
  for (const row of rows) {
    const parsed = appointmentRowSchema.safeParse(row);
    if (!parsed.success) {
      continue;
    }
    appointments.push({
      startsAt: parsed.data.starts_at,
      endsAt: parsed.data.ends_at,
      dentistName: `${parsed.data.dentist_first_name} ${parsed.data.dentist_last_name}`,
      status: parsed.data.status,
    });
  }

  return appointments.sort(
    (left, right) =>
      Date.parse(left.startsAt) - Date.parse(right.startsAt) ||
      left.dentistName.localeCompare(right.dentistName, "sr"),
  );
}
