import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { slotStep } from "./day-calendar";
import type { AppointmentFormChoices } from "./appointment-form";

const dentistSchema = z.object({
  id: z.string().uuid(),
  first_name: z.string().trim().min(1),
  last_name: z.string().trim().min(1),
  sees_patients: z.boolean(),
});

const patientSchema = z.object({
  id: z.string().uuid(),
  first_name: z.string().trim().min(1),
  last_name: z.string().trim().min(1),
  date_of_birth: z.string().nullable(),
});

const typeSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1),
});

export async function loadAppointmentChoices(clinicId: string): Promise<AppointmentFormChoices | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const [dentistsResult, patientsResult, contactsResult, typesResult, clinicResult] = await Promise.all([
      supabase
        .from("clinic_members")
        .select("id, first_name, last_name, sees_patients")
        .eq("clinic_id", clinicId)
        .eq("sees_patients", true)
        .order("last_name")
        .order("first_name"),
      supabase
        .from("patients")
        .select("id, first_name, last_name, date_of_birth")
        .eq("clinic_id", clinicId)
        .is("merged_into_id", null)
        .order("last_name")
        .order("first_name"),
      supabase.from("patient_contacts").select("patient_id").eq("clinic_id", clinicId),
      supabase
        .from("appointment_types")
        .select("id, name")
        .eq("clinic_id", clinicId)
        .eq("active", true)
        .order("sort_order"),
      supabase.from("clinics").select("slot_minutes").eq("id", clinicId).maybeSingle(),
    ]);

    const queryError =
      dentistsResult.error ??
      patientsResult.error ??
      contactsResult.error ??
      typesResult.error ??
      clinicResult.error;
    if (queryError) {
      console.error("load_appointment_choices rejected:", queryError.code);
      return null;
    }

    const dentists = (dentistsResult.data ?? [])
      .map((row) => dentistSchema.safeParse(row))
      .filter((result) => result.success && result.data.sees_patients)
      .map((result) => ({ id: result.data.id, label: `${result.data.first_name} ${result.data.last_name}` }));
    const contactPatientIds = new Set((contactsResult.data ?? []).map((row) => row.patient_id));
    const patients = (patientsResult.data ?? [])
      .map((row) => patientSchema.safeParse(row))
      .filter((result) => result.success)
      .map((result) => ({
        id: result.data.id,
        label: `${result.data.first_name} ${result.data.last_name}`,
        dateOfBirth: result.data.date_of_birth,
        hasContact: contactPatientIds.has(result.data.id),
      }));
    const types = (typesResult.data ?? [])
      .map((row) => typeSchema.safeParse(row))
      .filter((result) => result.success)
      .map((result) => ({ id: result.data.id, label: result.data.name }));

    return {
      dentists,
      patients,
      types,
      slotMinutes: slotStep(clinicResult.data?.slot_minutes),
    };
  } catch (error) {
    console.error("load_appointment_choices failed:", error instanceof Error ? error.name : "unknown");
    return null;
  }
}
