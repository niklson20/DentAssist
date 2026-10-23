import type { SupabaseClient } from "@supabase/supabase-js";

import { isIsoDate } from "@/lib/calendar-dates";
import {
  APPOINTMENT_STATUSES,
  type AppointmentStatus,
  type Relationship,
} from "@/lib/labels";
import { appointmentsOverlap, type ScheduledAppointment, type SlotMinutes } from "@/lib/slots";

export type AppointmentFacts = {
  slotMinutes: SlotMinutes;
  dateOfBirth: string | null;
  hasContact: boolean;
  unavailable: boolean;
  overlapping: boolean;
};

export type AppointmentRead =
  | { ok: true; facts: AppointmentFacts }
  | { ok: false; reason: "dentist" | "patient" | "type" | "error" };

export type StaffAppointmentInput = {
  clinicId: string;
  dentistId: string;
  patientId: string;
  appointmentTypeId: string;
  startsAt: string;
  endsAt: string;
  note: string | null;
};

export type GuardianContactInput = {
  clinicId: string;
  patientId: string;
  relationship: Relationship;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
};

export type AppointmentInsert = { ok: true; id: string } | { ok: false; conflict: boolean };

type Lookup = {
  clinicId: string;
  dentistId: string;
  patientId: string;
  appointmentTypeId: string;
  startsAt: Date;
  endsAt: Date;
};

export async function readAppointmentFacts(
  supabase: SupabaseClient,
  input: Lookup,
): Promise<AppointmentRead> {
  const [clinic, dentist, patient, appointmentType, contacts, occupied] = await Promise.all([
    supabase.from("clinics").select("slot_minutes").eq("id", input.clinicId).maybeSingle(),
    supabase
      .from("clinic_members")
      .select("role, sees_patients, unavailable")
      .eq("id", input.dentistId)
      .eq("clinic_id", input.clinicId)
      .maybeSingle(),
    supabase
      .from("patients")
      .select("date_of_birth, merged_into_id")
      .eq("id", input.patientId)
      .eq("clinic_id", input.clinicId)
      .maybeSingle(),
    supabase
      .from("appointment_types")
      .select("active")
      .eq("id", input.appointmentTypeId)
      .eq("clinic_id", input.clinicId)
      .maybeSingle(),
    supabase
      .from("patient_contacts")
      .select("id")
      .eq("clinic_id", input.clinicId)
      .eq("patient_id", input.patientId)
      .limit(1),
    supabase
      .from("appointments")
      .select("dentist_id, starts_at, ends_at, status")
      .eq("clinic_id", input.clinicId)
      .eq("dentist_id", input.dentistId)
      .lt("starts_at", input.endsAt.toISOString())
      .gt("ends_at", input.startsAt.toISOString()),
  ]);

  const slotMinutes = clinic.data?.slot_minutes;
  if (clinic.error || !isSlotMinutes(slotMinutes)) {
    if (clinic.error) console.error("read_appointment_clinic rejected:", codeOf(clinic.error));
    return { ok: false, reason: "error" };
  }

  if (dentist.error) {
    console.error("read_appointment_dentist rejected:", codeOf(dentist.error));
    return { ok: false, reason: "error" };
  }
  const dentistRow = rowOf(dentist.data);
  if (!dentistRow) return { ok: false, reason: "dentist" };
  if (typeof dentistRow.unavailable !== "boolean" || typeof dentistRow.sees_patients !== "boolean") {
    return { ok: false, reason: "error" };
  }
  if (!isChair(dentistRow)) return { ok: false, reason: "dentist" };

  if (patient.error) {
    console.error("read_appointment_patient rejected:", codeOf(patient.error));
    return { ok: false, reason: "error" };
  }
  const patientRow = rowOf(patient.data);
  if (!patientRow || patientRow.merged_into_id != null) return { ok: false, reason: "patient" };
  const dateOfBirth = patientRow.date_of_birth;
  let birth: string | null;
  if (dateOfBirth === null) {
    birth = null;
  } else if (typeof dateOfBirth === "string" && isIsoDate(dateOfBirth)) {
    birth = dateOfBirth;
  } else {
    return { ok: false, reason: "error" };
  }

  if (appointmentType.error) {
    console.error("read_appointment_type rejected:", codeOf(appointmentType.error));
    return { ok: false, reason: "error" };
  }
  const typeRow = rowOf(appointmentType.data);
  if (!typeRow) return { ok: false, reason: "type" };
  if (typeRow.active !== true) return { ok: false, reason: "type" };

  if (contacts.error) {
    console.error("read_appointment_contacts rejected:", codeOf(contacts.error));
    return { ok: false, reason: "error" };
  }
  const contactRows = rowsOf(contacts.data);
  if (!contactRows) return { ok: false, reason: "error" };

  if (occupied.error) {
    console.error("read_appointment_overlap rejected:", codeOf(occupied.error));
    return { ok: false, reason: "error" };
  }
  const occupiedRows = rowsOf(occupied.data);
  if (!occupiedRows) return { ok: false, reason: "error" };
  const overlap = findOverlap(input.dentistId, input.startsAt, input.endsAt, occupiedRows);
  if (overlap === null) return { ok: false, reason: "error" };

  return {
    ok: true,
    facts: {
      slotMinutes,
      dateOfBirth: birth,
      hasContact: contactRows.length > 0,
      unavailable: dentistRow.unavailable,
      overlapping: overlap,
    },
  };
}

export async function insertGuardianContact(
  supabase: SupabaseClient,
  input: GuardianContactInput,
): Promise<boolean> {
  const result = await supabase
    .from("patient_contacts")
    .insert({
      clinic_id: input.clinicId,
      patient_id: input.patientId,
      relationship: input.relationship,
      first_name: input.firstName,
      last_name: input.lastName,
      phone: input.phone,
      email: input.email,
    })
    .select("id")
    .single();

  if (result.error || !idOf(result.data)) {
    console.error("insert_guardian_contact rejected:", result.error ? codeOf(result.error) : "empty");
    return false;
  }
  return true;
}

export async function insertStaffAppointment(
  supabase: SupabaseClient,
  input: StaffAppointmentInput,
): Promise<AppointmentInsert> {
  const result = await supabase
    .from("appointments")
    .insert({
      clinic_id: input.clinicId,
      dentist_id: input.dentistId,
      patient_id: input.patientId,
      appointment_type_id: input.appointmentTypeId,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      status: "scheduled",
      source: "staff",
      note: input.note,
    })
    .select("id")
    .single();

  const code = result.error ? codeOf(result.error) : null;
  if (code) {
    console.error("insert_staff_appointment rejected:", code);
    return { ok: false, conflict: code === "23P01" };
  }
  const id = idOf(result.data);
  if (!id) {
    console.error("insert_staff_appointment rejected:", "empty");
    return { ok: false, conflict: false };
  }
  return { ok: true, id };
}

function findOverlap(
  dentistId: string,
  startsAt: Date,
  endsAt: Date,
  rows: Record<string, unknown>[],
): boolean | null {
  const next: ScheduledAppointment = {
    dentistId,
    startsAt,
    endsAt,
    status: "scheduled",
  };
  for (const row of rows) {
    if (typeof row.dentist_id !== "string" || !isAppointmentStatus(row.status)) return null;
    const rowStart = instant(row.starts_at);
    const rowEnd = instant(row.ends_at);
    if (!rowStart || !rowEnd) return null;
    if (
      appointmentsOverlap(next, {
        dentistId: row.dentist_id,
        startsAt: rowStart,
        endsAt: rowEnd,
        status: row.status,
      })
    ) {
      return true;
    }
  }
  return false;
}

function isChair(row: Record<string, unknown>): boolean {
  return (row.role === "dentist" || row.role === "owner") && row.sees_patients === true;
}

function isSlotMinutes(value: unknown): value is SlotMinutes {
  return value === 15 || value === 30;
}

function isAppointmentStatus(value: unknown): value is AppointmentStatus {
  return typeof value === "string" && APPOINTMENT_STATUSES.some((status) => status === value);
}

function instant(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function rowOf(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function rowsOf(value: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(value)) return null;
  const rows: Record<string, unknown>[] = [];
  for (const item of value) {
    const row = rowOf(item);
    if (!row) return null;
    rows.push(row);
  }
  return rows;
}

function idOf(value: unknown): string | null {
  const row = rowOf(value);
  return row && typeof row.id === "string" ? row.id : null;
}

function codeOf(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return "unknown";
}
