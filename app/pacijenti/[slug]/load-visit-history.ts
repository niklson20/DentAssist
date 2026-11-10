import { z } from "zod";

import { formatBelgradeDate } from "@/lib/calendar-dates";
import { APPOINTMENT_STATUSES } from "@/lib/labels";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { VisitHistoryItem, VisitHistoryNote } from "./history";

/** Statuses shown on the chart history tab (PRD 8.3). Offered holds stay off the list. */
export const CHART_HISTORY_STATUSES = [
  "pending_confirmation",
  "scheduled",
  "completed",
  "no_show",
  "cancelled",
] as const satisfies readonly (typeof APPOINTMENT_STATUSES)[number][];

const instant = z.string().refine((value) => Number.isFinite(Date.parse(value)));

const appointmentSchema = z
  .object({
    id: z.string().uuid(),
    dentist_id: z.string().uuid(),
    starts_at: instant,
    status: z.enum(APPOINTMENT_STATUSES),
  })
  .strip();

const memberSchema = z
  .object({
    id: z.string().uuid(),
    first_name: z.string().trim().min(1).max(80),
    last_name: z.string().trim().min(1).max(80),
  })
  .strip();

const visitNoteSchema = z
  .object({
    appointment_id: z.string().uuid(),
    procedure_description: z.string().nullable(),
    recommendations: z.string().nullable(),
    treatment_plan: z.string().nullable(),
    internal_notes: z.string().nullable(),
  })
  .strip();

export async function loadVisitHistory(
  clinicId: string,
  patientId: string,
  options: { includeNotes?: boolean } = {},
): Promise<VisitHistoryItem[] | null> {
  if (!z.string().uuid().safeParse(clinicId).success || !z.string().uuid().safeParse(patientId).success) {
    return null;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const appointmentsResult = await supabase
      .from("appointments")
      .select("id, dentist_id, starts_at, status")
      .eq("clinic_id", clinicId)
      .eq("patient_id", patientId)
      .in("status", [...CHART_HISTORY_STATUSES])
      .order("starts_at", { ascending: false });

    if (appointmentsResult.error) {
      console.error("load_visit_history rejected:", appointmentsResult.error.code ?? "rejected");
      return null;
    }

    const appointments = parseAppointments(appointmentsResult.data ?? []);
    const dentistIds = [...new Set(appointments.map((row) => row.dentist_id))];
    const membersResult =
      dentistIds.length > 0
        ? await supabase
            .from("clinic_members")
            .select("id, first_name, last_name")
            .eq("clinic_id", clinicId)
            .in("id", dentistIds)
        : { data: [], error: null };

    if (membersResult.error) {
      console.error("load_visit_history members rejected:", membersResult.error.code ?? "rejected");
      return null;
    }

    let notesByAppointment = new Map<string, VisitHistoryNote>();
    if (options.includeNotes) {
      const completedIds = appointments
        .filter((row) => row.status === "completed")
        .map((row) => row.id);
      if (completedIds.length > 0) {
        const visitsResult = await supabase
          .from("visits")
          .select(
            "appointment_id, procedure_description, recommendations, treatment_plan, internal_notes",
          )
          .eq("clinic_id", clinicId)
          .eq("patient_id", patientId)
          .in("appointment_id", completedIds);

        if (visitsResult.error) {
          console.error("load_visit_history notes rejected:", visitsResult.error.code ?? "rejected");
          return null;
        }

        notesByAppointment = noteMap(visitsResult.data ?? []);
      }
    }

    return visitsFromRows(appointments, membersResult.data ?? [], {
      includeNotes: options.includeNotes === true,
      notesByAppointment,
    });
  } catch (error) {
    console.error("load_visit_history failed:", error instanceof Error ? error.name : "unknown");
    return null;
  }
}

export function visitsFromRows(
  appointments: unknown,
  members: unknown,
  options: {
    includeNotes?: boolean;
    notesByAppointment?: ReadonlyMap<string, VisitHistoryNote>;
  } = {},
): VisitHistoryItem[] {
  const dentistNames = dentistNameMap(members);
  const historyStatuses = new Set<string>(CHART_HISTORY_STATUSES);
  const notesByAppointment = options.notesByAppointment ?? new Map<string, VisitHistoryNote>();
  const includeNotes = options.includeNotes === true;

  return parseAppointments(appointments)
    .filter((row) => historyStatuses.has(row.status))
    .map((row) => {
      const startsAt = new Date(row.starts_at);
      if (Number.isNaN(startsAt.getTime())) {
        return null;
      }
      return {
        id: row.id,
        status: row.status,
        dentist: dentistNames.get(row.dentist_id) ?? "",
        date: formatBelgradeDate(startsAt),
        startsAtMs: startsAt.getTime(),
        note:
          includeNotes && row.status === "completed"
            ? (notesByAppointment.get(row.id) ?? null)
            : undefined,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort(
      (left, right) =>
        right.startsAtMs - left.startsAtMs || left.id.localeCompare(right.id),
    )
    .map((row) => {
      const item: VisitHistoryItem = {
        id: row.id,
        status: row.status,
        dentist: row.dentist,
        date: row.date,
      };
      if (row.note !== undefined) {
        item.note = row.note;
      }
      return item;
    });
}

function parseAppointments(rows: unknown) {
  if (!Array.isArray(rows)) {
    return [];
  }
  const appointments: z.infer<typeof appointmentSchema>[] = [];
  for (const row of rows) {
    const parsed = appointmentSchema.safeParse(row);
    if (!parsed.success) {
      continue;
    }
    appointments.push(parsed.data);
  }
  return appointments;
}

function noteMap(rows: unknown): Map<string, VisitHistoryNote> {
  const notes = new Map<string, VisitHistoryNote>();
  if (!Array.isArray(rows)) {
    return notes;
  }
  for (const row of rows) {
    const parsed = visitNoteSchema.safeParse(row);
    if (!parsed.success) {
      continue;
    }
    notes.set(parsed.data.appointment_id, {
      procedureDescription: parsed.data.procedure_description ?? "",
      recommendations: parsed.data.recommendations ?? "",
      treatmentPlan: parsed.data.treatment_plan ?? "",
      internalNotes: parsed.data.internal_notes ?? "",
    });
  }
  return notes;
}

function dentistNameMap(rows: unknown): Map<string, string> {
  const names = new Map<string, string>();
  if (!Array.isArray(rows)) {
    return names;
  }
  for (const row of rows) {
    const parsed = memberSchema.safeParse(row);
    if (!parsed.success) {
      continue;
    }
    names.set(parsed.data.id, `${parsed.data.first_name} ${parsed.data.last_name}`);
  }
  return names;
}
