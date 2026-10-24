"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z, type ZodError } from "zod";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireMember } from "@/lib/auth";
import { isVisitLocked } from "@/lib/calendar-dates";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const CHECK = "Proverite unete podatke.";
const UNAVAILABLE = "Čuvanje trenutno nije moguće. Pokušajte ponovo.";
const HIDDEN = "Zapis posete nije dostupan.";
const PICK_APPOINTMENT = "Izaberite termin.";
const TEXT_MAX = "Tekst može imati najviše 4000 znakova.";
const APPOINTMENT_MISSING = "Termin nije pronađen.";
const NOT_COMPLETED = "Zapis se čuva samo za završen termin.";
const LOCKED = "Zapis je zaključan.";
const ALREADY = "Termin već ima zapis.";
const MISSING = "Zapis nije pronađen.";

const note = z.string().trim().max(4000, TEXT_MAX);

const visitSchema = z.object({
  termin: z.string({ error: PICK_APPOINTMENT }).trim().uuid(PICK_APPOINTMENT),
  opis: note,
  preporuke: note,
  plan: note,
  beleske: note,
});

type VisitInput = z.infer<typeof visitSchema>;
type WriteMode = "create" | "update";

type LoadedAppointment = {
  status: string;
  endsAt: Date;
};

export async function saveVisit(
  _previous: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return writeVisit(formData, "create");
}

export async function updateVisit(
  _previous: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return writeVisit(formData, "update");
}

async function writeVisit(formData: FormData, mode: WriteMode): Promise<ActionResult<{ id: string }>> {
  const member = await requireMember();
  if (member.role !== "owner" && member.role !== "dentist") {
    return fail(HIDDEN);
  }

  const parsed = visitSchema.safeParse(readVisitFields(formData));
  if (!parsed.success) {
    return fail(CHECK, fieldErrorsFrom(parsed.error));
  }

  try {
    const supabase = await createSupabaseServerClient();
    const appointment = await loadAppointment(supabase, member.clinicId, parsed.data.termin);
    if (appointment === "missing") return fail(APPOINTMENT_MISSING);
    if (appointment === "unavailable") return fail(UNAVAILABLE);
    if (appointment.status !== "completed") return fail(NOT_COMPLETED);
    if (isVisitLocked(appointment.endsAt, new Date())) return fail(LOCKED);

    const existing = await loadVisit(supabase, member.clinicId, parsed.data.termin);
    if (existing === "unavailable") return fail(UNAVAILABLE);
    if (mode === "create" && existing === "present") return fail(ALREADY);
    if (mode === "update" && existing === "absent") return fail(MISSING);

    const saved = await supabase.rpc("save_visit", {
      p_appointment_id: parsed.data.termin,
      p_procedure_description: emptyToNull(parsed.data.opis),
      p_recommendations: emptyToNull(parsed.data.preporuke),
      p_treatment_plan: emptyToNull(parsed.data.plan),
      p_internal_notes: emptyToNull(parsed.data.beleske),
    });
    if (saved.error) {
      console.error("save_visit rejected:", saved.error.code ?? "rejected");
      return fail(UNAVAILABLE);
    }

    const id = typeof saved.data === "string" ? saved.data : null;
    if (!id) {
      console.error("save_visit rejected:", "invalid");
      return fail(UNAVAILABLE);
    }

    revalidatePath("/danas");
    revalidatePath("/pacijenti", "layout");
    return ok({ id });
  } catch (error) {
    console.error("save_visit failed:", error instanceof Error ? error.name : "unknown");
    return fail(UNAVAILABLE);
  }
}

async function loadAppointment(
  supabase: SupabaseClient,
  clinicId: string,
  appointmentId: string,
): Promise<LoadedAppointment | "missing" | "unavailable"> {
  const result = await supabase
    .from("appointments")
    .select("status, ends_at")
    .eq("clinic_id", clinicId)
    .eq("id", appointmentId)
    .maybeSingle();

  if (result.error) {
    console.error("save_visit appointment rejected:", result.error.code ?? "rejected");
    return "unavailable";
  }

  if (!result.data) return "missing";
  const appointment = appointmentFrom(result.data);
  return appointment ?? "unavailable";
}

async function loadVisit(
  supabase: SupabaseClient,
  clinicId: string,
  appointmentId: string,
): Promise<"present" | "absent" | "unavailable"> {
  const result = await supabase
    .from("visits")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("appointment_id", appointmentId)
    .maybeSingle();

  if (result.error) {
    console.error("save_visit read rejected:", result.error.code ?? "rejected");
    return "unavailable";
  }

  if (!result.data) return "absent";
  return visitId(result.data) ? "present" : "unavailable";
}

function appointmentFrom(data: unknown): LoadedAppointment | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  if (typeof row.status !== "string" || typeof row.ends_at !== "string") return null;
  const endsAt = new Date(row.ends_at);
  if (Number.isNaN(endsAt.getTime())) return null;
  return { status: row.status, endsAt };
}

function visitId(data: unknown): string | null {
  if (!data || typeof data !== "object" || !("id" in data)) return null;
  return typeof data.id === "string" && data.id.length > 0 ? data.id : null;
}

function readVisitFields(formData: FormData): VisitInput {
  return {
    termin: text(formData.get("termin")),
    opis: text(formData.get("opis")),
    preporuke: text(formData.get("preporuke")),
    plan: text(formData.get("plan")),
    beleske: text(formData.get("beleske")),
  };
}

function emptyToNull(value: string): string | null {
  return value.length > 0 ? value : null;
}

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function fieldErrorsFrom(error: ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    (result[field] ??= []).push(issue.message);
  }
  return result;
}
