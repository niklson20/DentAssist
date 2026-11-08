"use server";

import { z } from "zod";

import { requireMember } from "@/lib/auth";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import {
  formatBelgrade,
  isIsoDate,
  isoDayOfWeek,
  startOfBelgradeDay,
  startOfNextBelgradeDay,
} from "@/lib/calendar-dates";
import { APPOINTMENT_STATUSES } from "@/lib/labels";
import {
  availableSlotStarts,
  type ScheduledAppointment,
  type TimeRange,
  type WorkingInterval,
} from "@/lib/slots";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  dentistId: z.string().uuid(),
  date: z.string().refine(isIsoDate),
  duration: z.number().int().min(15).max(120),
  excludeAppointmentId: z.string().uuid().nullable(),
});

const slotConfigurationSchema = z.object({
  slot_minutes: z.union([z.literal(15), z.literal(30)]),
  buffer_minutes: z.union([z.literal(0), z.literal(5), z.literal(10), z.literal(15)]),
  min_notice_minutes: z.number().int().nonnegative(),
  max_ahead_days: z.number().int().nonnegative(),
});

const dentistSchema = z.object({
  role: z.enum(["owner", "dentist"]),
  sees_patients: z.literal(true),
  unavailable: z.boolean(),
});

const workingHoursSchema = z.object({
  is_closed: z.boolean(),
  opens_at: z.string().nullable(),
  closes_at: z.string().nullable(),
  break_starts_at: z.string().nullable(),
  break_ends_at: z.string().nullable(),
});

const blockedPeriodSchema = z.object({
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }),
});

const occupiedAppointmentSchema = z.object({
  dentist_id: z.string().uuid(),
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }),
  status: z.enum(APPOINTMENT_STATUSES),
});

const UNAVAILABLE = "Slobodni termini trenutno nisu dostupni. Pokušajte ponovo.";

export async function loadAvailableAppointmentSlots(
  input: {
    dentistId: string;
    date: string;
    duration: number;
    excludeAppointmentId?: string | null;
  },
): Promise<ActionResult<string[]>> {
  const parsed = requestSchema.safeParse({
    ...input,
    excludeAppointmentId: input.excludeAppointmentId ?? null,
  });
  if (!parsed.success) return fail(UNAVAILABLE);

  const member = await requireMember();
  const dayStart = startOfBelgradeDay(parsed.data.date);
  const dayEnd = startOfNextBelgradeDay(parsed.data.date);
  const dayOfWeek = isoDayOfWeek(parsed.data.date);

  try {
    const supabase = await createSupabaseServerClient();
    const [clinicResult, dentistResult, hoursResult, blocksResult, appointmentsResult] = await Promise.all([
      supabase
        .from("clinics")
        .select("slot_minutes, buffer_minutes, min_notice_minutes, max_ahead_days")
        .eq("id", member.clinicId)
        .maybeSingle(),
      supabase
        .from("clinic_members")
        .select("role, sees_patients, unavailable")
        .eq("id", parsed.data.dentistId)
        .eq("clinic_id", member.clinicId)
        .maybeSingle(),
      supabase
        .from("working_hours")
        .select("is_closed, opens_at, closes_at, break_starts_at, break_ends_at")
        .eq("clinic_member_id", parsed.data.dentistId)
        .eq("clinic_id", member.clinicId)
        .eq("iso_dow", dayOfWeek)
        .maybeSingle(),
      supabase
        .from("blocked_periods")
        .select("starts_at, ends_at")
        .eq("clinic_member_id", parsed.data.dentistId)
        .eq("clinic_id", member.clinicId)
        .lt("starts_at", dayEnd.toISOString())
        .gt("ends_at", dayStart.toISOString()),
      supabase
        .from("appointments")
        .select("dentist_id, starts_at, ends_at, status")
        .eq("clinic_id", member.clinicId)
        .eq("dentist_id", parsed.data.dentistId)
        .in("status", [...APPOINTMENT_STATUSES.filter((status) => status !== "cancelled")])
        .lt("starts_at", dayEnd.toISOString())
        .gt("ends_at", dayStart.toISOString())
        .neq("id", parsed.data.excludeAppointmentId ?? "00000000-0000-0000-0000-000000000000"),
    ]);

    const queryError =
      clinicResult.error ??
      dentistResult.error ??
      hoursResult.error ??
      blocksResult.error ??
      appointmentsResult.error;
    if (queryError) {
      console.error("load_available_appointment_slots rejected:", queryError.code);
      return fail(UNAVAILABLE);
    }

    const clinic = slotConfigurationSchema.safeParse(clinicResult.data);
    const dentist = dentistSchema.safeParse(dentistResult.data);
    const hours = hoursResult.data === null ? null : workingHoursSchema.safeParse(hoursResult.data);
    const blocks = z.array(blockedPeriodSchema).safeParse(blocksResult.data);
    const appointments = z.array(occupiedAppointmentSchema).safeParse(appointmentsResult.data);
    if (!clinic.success || !dentist.success || (hours !== null && !hours.success) || !blocks.success || !appointments.success) {
      console.error("load_available_appointment_slots returned invalid data");
      return fail(UNAVAILABLE);
    }

    const workingDay: WorkingInterval | null = hours
      ? {
          isClosed: hours.data.is_closed,
          opensAt: hours.data.opens_at,
          closesAt: hours.data.closes_at,
          breakStartsAt: hours.data.break_starts_at,
          breakEndsAt: hours.data.break_ends_at,
        }
      : null;
    const blockedPeriods: TimeRange[] = blocks.data.map((block) => ({
      startsAt: new Date(block.starts_at),
      endsAt: new Date(block.ends_at),
    }));
    const occupied: ScheduledAppointment[] = appointments.data.map((appointment) => ({
      dentistId: appointment.dentist_id,
      startsAt: new Date(appointment.starts_at),
      endsAt: new Date(appointment.ends_at),
      status: appointment.status,
    }));
    const starts = availableSlotStarts({
      dentistId: parsed.data.dentistId,
      now: new Date(),
      day: parsed.data.date,
      slotMinutes: clinic.data.slot_minutes,
      bufferMinutes: clinic.data.buffer_minutes,
      durationMinutes: parsed.data.duration,
      minNoticeMinutes: clinic.data.min_notice_minutes,
      maxAheadDays: clinic.data.max_ahead_days,
      unavailable: dentist.data.unavailable,
      workingDay,
      blockedPeriods,
      occupied,
    });

    return ok(
      starts.map((start) =>
        formatBelgrade(start, {
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }),
      ),
    );
  } catch (error) {
    console.error("load_available_appointment_slots failed:", error instanceof Error ? error.name : "unknown");
    return fail(UNAVAILABLE);
  }
}
