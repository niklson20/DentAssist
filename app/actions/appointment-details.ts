"use server";

import { z } from "zod";

import { requireMember } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadAppointmentChoices } from "@/app/danas/load-appointment-choices";
import { APPOINTMENT_STATUSES } from "@/lib/labels";

const idSchema = z.string().uuid();

export async function loadAppointmentDetails(appointmentId: string) {
  if (!idSchema.safeParse(appointmentId).success) return null;

  const member = await requireMember();
  try {
    const supabase = await createSupabaseServerClient();
    const result = await supabase
      .from("appointments")
      .select("id, dentist_id, patient_id, appointment_type_id, starts_at, ends_at, status, note, cancellation_note")
      .eq("id", appointmentId)
      .eq("clinic_id", member.clinicId)
      .maybeSingle();
    if (result.error || !result.data) {
      if (result.error) console.error("load_appointment_details rejected:", result.error.code);
      return null;
    }

    const appointment = result.data;
    const [patientResult, dentistResult, typeResult, choices, selfResult] = await Promise.all([
      supabase
        .from("patients")
        .select("id, slug, first_name, last_name")
        .eq("id", appointment.patient_id)
        .eq("clinic_id", member.clinicId)
        .maybeSingle(),
      supabase
        .from("clinic_members")
        .select("id, first_name, last_name")
        .eq("id", appointment.dentist_id)
        .eq("clinic_id", member.clinicId)
        .maybeSingle(),
      supabase
        .from("appointment_types")
        .select("id, name")
        .eq("id", appointment.appointment_type_id)
        .eq("clinic_id", member.clinicId)
        .maybeSingle(),
      loadAppointmentChoices(member.clinicId),
      member.role === "dentist"
        ? supabase
            .from("clinic_members")
            .select("id")
            .eq("clinic_id", member.clinicId)
            .eq("user_id", member.userId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (patientResult.error || dentistResult.error || typeResult.error || !patientResult.data || !dentistResult.data || !typeResult.data || !choices) {
      console.error(
        "load_appointment_details related data rejected:",
        patientResult.error?.code ?? dentistResult.error?.code ?? typeResult.error?.code ?? "missing",
      );
      return null;
    }
    if (selfResult.error) {
      console.error("load_appointment_details member rejected:", selfResult.error.code);
      return null;
    }

    const status = APPOINTMENT_STATUSES.find((value) => value === appointment.status);
    const startsAt = new Date(appointment.starts_at);
    const endsAt = new Date(appointment.ends_at);
    if (!status || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) return null;
    const dateLabel = new Intl.DateTimeFormat("sr-Latn-RS", {
      timeZone: "Europe/Belgrade",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(startsAt);
    const timeLabel = new Intl.DateTimeFormat("sr-Latn-RS", {
      timeZone: "Europe/Belgrade",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(startsAt);
    const canComplete =
      member.role === "owner" ||
      (member.role === "dentist" && selfResult.data?.id === appointment.dentist_id);

    return {
      appointment: {
        id: appointment.id,
        dentistId: appointment.dentist_id,
        patientId: appointment.patient_id,
        startsAt: belgradeInput(startsAt),
        endsAt: endsAt.toISOString(),
        durationMinutes: Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000),
        typeId: appointment.appointment_type_id,
        note: appointment.note ?? "",
      },
      dateLabel,
      timeLabel,
      status,
      cancellationNote: appointment.cancellation_note,
      patient: {
        name: `${patientResult.data.first_name} ${patientResult.data.last_name}`,
        href: `/pacijenti/${patientResult.data.slug}`,
      },
      dentistName: `${dentistResult.data.first_name} ${dentistResult.data.last_name}`,
      typeName: typeResult.data.name,
      choices,
      canComplete,
      role: member.role,
    };
  } catch (error) {
    console.error("load_appointment_details failed:", error instanceof Error ? error.name : "unknown");
    return null;
  }
}

function belgradeInput(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Belgrade",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}
