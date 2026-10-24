"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z, type ZodError } from "zod";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireMember } from "@/lib/auth";
import { ALERT_CODES } from "@/lib/labels";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const CHECK = "Proverite unete podatke.";
const UNAVAILABLE = "Čuvanje trenutno nije moguće. Pokušajte ponovo.";
const CHART_MISSING = "Karton nije pronađen.";
const ANAMNESIS_HIDDEN = "Anamneza nije dostupna.";
const ALERT_HIDDEN = "Upozorenje nije dostupno.";
const PICK_CHART = "Izaberite karton.";
const PICK_CODE = "Izaberite šifru.";
const NOTE_REQUIRED = "Unesite kratak tekst.";
const NOTE_MAX = "Tekst može imati najviše 500 znakova.";
const TEXT_MAX = "Tekst može imati najviše 4000 znakova.";

const longText = z.string().trim().max(4000, TEXT_MAX);

const anamnesisSchema = z.object({
  patientId: z.string({ error: PICK_CHART }).trim().uuid(PICK_CHART),
  chronicConditions: longText,
  medications: longText,
  allergies: longText,
  pregnancy: longText,
});

const alertSchema = z.object({
  patientId: z.string({ error: PICK_CHART }).trim().uuid(PICK_CHART),
  code: z.enum(ALERT_CODES, { error: PICK_CODE }),
  note: z.string().trim().min(1, NOTE_REQUIRED).max(500, NOTE_MAX),
});

export async function saveAnamnesis(
  _previous: ActionResult<{ patientId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ patientId: string }>> {
  const member = await requireMember();
  if (member.role === "reception") {
    return fail(ANAMNESIS_HIDDEN);
  }

  const parsed = anamnesisSchema.safeParse({
    patientId: text(formData.get("patientId")),
    chronicConditions: text(formData.get("chronicConditions")),
    medications: text(formData.get("medications")),
    allergies: text(formData.get("allergies")),
    pregnancy: text(formData.get("pregnancy")),
  });
  if (!parsed.success) {
    return fail(CHECK, fieldErrorsFrom(parsed.error));
  }

  try {
    const supabase = await createSupabaseServerClient();
    const chart = await findOpenChart(supabase, member.clinicId, parsed.data.patientId);
    if (chart === "missing") return fail(CHART_MISSING);
    if (chart === "unavailable") return fail(UNAVAILABLE);

    const saved = await supabase.from("patient_anamnesis").upsert(
      {
        patient_id: parsed.data.patientId,
        clinic_id: member.clinicId,
        chronic_conditions: emptyToNull(parsed.data.chronicConditions),
        medications: emptyToNull(parsed.data.medications),
        allergies: emptyToNull(parsed.data.allergies),
        pregnancy: emptyToNull(parsed.data.pregnancy),
      },
      { onConflict: "patient_id" },
    );
    if (saved.error) {
      console.error("save_anamnesis rejected:", saved.error.code ?? "rejected");
      return fail(UNAVAILABLE);
    }

    revalidatePath("/danas");
    revalidatePath("/pacijenti", "layout");
    return ok({ patientId: parsed.data.patientId });
  } catch (error) {
    console.error("save_anamnesis failed:", error instanceof Error ? error.name : "unknown");
    return fail(UNAVAILABLE);
  }
}

export async function saveAlert(
  _previous: ActionResult<{ patientId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ patientId: string }>> {
  const member = await requireMember();
  if (member.role === "reception") {
    return fail(ALERT_HIDDEN);
  }

  const parsed = alertSchema.safeParse({
    patientId: text(formData.get("patientId")),
    code: text(formData.get("code")),
    note: text(formData.get("note")),
  });
  if (!parsed.success) {
    return fail(CHECK, fieldErrorsFrom(parsed.error));
  }

  try {
    const supabase = await createSupabaseServerClient();
    const chart = await findOpenChart(supabase, member.clinicId, parsed.data.patientId);
    if (chart === "missing") return fail(CHART_MISSING);
    if (chart === "unavailable") return fail(UNAVAILABLE);

    const saved = await supabase.from("patient_alerts").insert({
      patient_id: parsed.data.patientId,
      clinic_id: member.clinicId,
      code: parsed.data.code,
      note: parsed.data.note,
    });
    if (saved.error) {
      console.error("save_alert rejected:", saved.error.code ?? "rejected");
      return fail(UNAVAILABLE);
    }

    revalidatePath("/danas");
    revalidatePath("/pacijenti", "layout");
    return ok({ patientId: parsed.data.patientId });
  } catch (error) {
    console.error("save_alert failed:", error instanceof Error ? error.name : "unknown");
    return fail(UNAVAILABLE);
  }
}

async function findOpenChart(
  supabase: SupabaseClient,
  clinicId: string,
  patientId: string,
): Promise<"found" | "missing" | "unavailable"> {
  const result = await supabase
    .from("patients")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("id", patientId)
    .is("merged_into_id", null)
    .maybeSingle();

  if (result.error) {
    console.error("save_patient_chart rejected:", result.error.code ?? "rejected");
    return "unavailable";
  }

  const id = chartId(result.data);
  return id === patientId ? "found" : "missing";
}

function chartId(data: unknown): string | null {
  if (!data || typeof data !== "object" || !("id" in data)) {
    return null;
  }
  return typeof data.id === "string" ? data.id : null;
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
