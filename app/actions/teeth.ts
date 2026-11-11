"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z, type ZodError } from "zod";

import { readToothChart } from "@/app/pacijenti/[slug]/load-tooth-chart";
import {
  isFdiTooth,
  isToothStatus,
  surfacesForDb,
  type ToothChart,
} from "@/app/pacijenti/[slug]/tooth-chart";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireMember, type MemberSession } from "@/lib/auth";
import {
  TOOTH_STATUSES,
  TOOTH_SURFACES,
  toothStatusAllowsSurfaces,
  type ToothStatus,
  type ToothSurface,
} from "@/lib/labels";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const CHECK = "Proverite unete podatke.";
const UNAVAILABLE = "Čuvanje trenutno nije moguće. Pokušajte ponovo.";
const HIDDEN = "Zubna mapa nije dostupna.";
const CHART_MISSING = "Karton nije pronađen.";
const CHANGE_MISSING = "Izmena nije pronađena.";
const NOT_LATEST = "Može se poništiti samo poslednja izmena za taj zub.";

const patientIdSchema = z.string().trim().uuid(CHART_MISSING);
const fdiSchema = z
  .string()
  .trim()
  .refine((value) => isFdiTooth(value), CHECK);
const statusSchema = z.enum(TOOTH_STATUSES, { error: CHECK });
const surfacesSchema = z.array(z.enum(TOOTH_SURFACES, { error: CHECK }), { error: CHECK });

const statusInputSchema = z.object({
  patientId: patientIdSchema,
  fdiCode: fdiSchema,
  status: statusSchema,
});

const surfacesInputSchema = z.object({
  patientId: patientIdSchema,
  fdiCode: fdiSchema,
  surfaces: surfacesSchema,
});

const undoInputSchema = z.object({
  patientId: patientIdSchema,
  fdiCode: fdiSchema,
  changeId: z.string().trim().uuid(CHANGE_MISSING),
});

export async function loadToothChart(patientId: string): Promise<ActionResult<{ chart: ToothChart }>> {
  const member = await requireClinical();
  if (!member) return fail(HIDDEN);

  const parsed = patientIdSchema.safeParse(patientId);
  if (!parsed.success) return fail(CHART_MISSING);

  try {
    const supabase = await createSupabaseServerClient();
    const chartState = await findOpenChart(supabase, member.clinicId, parsed.data);
    if (chartState === "missing") return fail(CHART_MISSING);
    if (chartState === "unavailable") return fail(UNAVAILABLE);

    const chart = await readToothChart(supabase, member.clinicId, parsed.data);
    if (!chart) return fail(UNAVAILABLE);
    return ok({ chart });
  } catch (error) {
    console.error("load_tooth_chart failed:", error instanceof Error ? error.name : "unknown");
    return fail(UNAVAILABLE);
  }
}

export async function saveToothStatus(input: {
  patientId: string;
  fdiCode: string;
  status: ToothStatus;
}): Promise<ActionResult<{ chart: ToothChart }>> {
  const member = await requireClinical();
  if (!member) return fail(HIDDEN);

  const parsed = statusInputSchema.safeParse(input);
  if (!parsed.success) return fail(CHECK, fieldErrorsFrom(parsed.error));

  try {
    const supabase = await createSupabaseServerClient();
    const chartState = await findOpenChart(supabase, member.clinicId, parsed.data.patientId);
    if (chartState === "missing") return fail(CHART_MISSING);
    if (chartState === "unavailable") return fail(UNAVAILABLE);

    const saved = await supabase.from("tooth_states").upsert(
      {
        patient_id: parsed.data.patientId,
        clinic_id: member.clinicId,
        fdi_code: parsed.data.fdiCode,
        status: parsed.data.status,
        surfaces: surfacesForDb(parsed.data.status, []),
      },
      { onConflict: "patient_id,fdi_code" },
    );
    if (saved.error) {
      console.error("save_tooth_status rejected:", saved.error.code ?? "rejected");
      return fail(UNAVAILABLE);
    }

    return await chartAfterWrite(supabase, member.clinicId, parsed.data.patientId);
  } catch (error) {
    console.error("save_tooth_status failed:", error instanceof Error ? error.name : "unknown");
    return fail(UNAVAILABLE);
  }
}

export async function saveToothSurfaces(input: {
  patientId: string;
  fdiCode: string;
  surfaces: ToothSurface[];
}): Promise<ActionResult<{ chart: ToothChart }>> {
  const member = await requireClinical();
  if (!member) return fail(HIDDEN);

  const parsed = surfacesInputSchema.safeParse(input);
  if (!parsed.success) return fail(CHECK, fieldErrorsFrom(parsed.error));

  try {
    const supabase = await createSupabaseServerClient();
    const chartState = await findOpenChart(supabase, member.clinicId, parsed.data.patientId);
    if (chartState === "missing") return fail(CHART_MISSING);
    if (chartState === "unavailable") return fail(UNAVAILABLE);

    const existing = await supabase
      .from("tooth_states")
      .select("id, status")
      .eq("clinic_id", member.clinicId)
      .eq("patient_id", parsed.data.patientId)
      .eq("fdi_code", parsed.data.fdiCode)
      .maybeSingle();

    if (existing.error) {
      console.error("save_tooth_surfaces read rejected:", existing.error.code ?? "rejected");
      return fail(UNAVAILABLE);
    }
    if (!existing.data || typeof existing.data.status !== "string" || !isToothStatus(existing.data.status)) {
      return fail(CHECK);
    }
    if (!toothStatusAllowsSurfaces(existing.data.status)) {
      return fail(CHECK);
    }

    const updated = await supabase
      .from("tooth_states")
      .update({
        surfaces: surfacesForDb(existing.data.status, parsed.data.surfaces),
      })
      .eq("clinic_id", member.clinicId)
      .eq("patient_id", parsed.data.patientId)
      .eq("fdi_code", parsed.data.fdiCode);

    if (updated.error) {
      console.error("save_tooth_surfaces rejected:", updated.error.code ?? "rejected");
      return fail(UNAVAILABLE);
    }

    return await chartAfterWrite(supabase, member.clinicId, parsed.data.patientId);
  } catch (error) {
    console.error("save_tooth_surfaces failed:", error instanceof Error ? error.name : "unknown");
    return fail(UNAVAILABLE);
  }
}

/**
 * Hard-delete the newest history row for a tooth via revert_tooth_change RPC.
 * Restores tooth_states without appending a new tooth_state_changes row.
 */
export async function undoToothChange(input: {
  patientId: string;
  fdiCode: string;
  changeId: string;
}): Promise<ActionResult<{ chart: ToothChart }>> {
  const member = await requireClinical();
  if (!member) return fail(HIDDEN);

  const parsed = undoInputSchema.safeParse(input);
  if (!parsed.success) return fail(CHECK, fieldErrorsFrom(parsed.error));

  try {
    const supabase = await createSupabaseServerClient();
    const chartState = await findOpenChart(supabase, member.clinicId, parsed.data.patientId);
    if (chartState === "missing") return fail(CHART_MISSING);
    if (chartState === "unavailable") return fail(UNAVAILABLE);

    const reverted = await supabase.rpc("revert_tooth_change", {
      p_change_id: parsed.data.changeId,
    });
    if (reverted.error) {
      console.error("revert_tooth_change rejected:", reverted.error.code ?? "rejected");
      return fail(UNAVAILABLE);
    }

    const status = rpcStatus(reverted.data);
    if (status === "ok") {
      return await chartAfterWrite(supabase, member.clinicId, parsed.data.patientId);
    }
    if (status === "forbidden") return fail(HIDDEN);
    if (status === "missing") return fail(CHANGE_MISSING);
    if (status === "not_latest") return fail(NOT_LATEST);
    return fail(UNAVAILABLE);
  } catch (error) {
    console.error("undo_tooth_change failed:", error instanceof Error ? error.name : "unknown");
    return fail(UNAVAILABLE);
  }
}

async function chartAfterWrite(
  supabase: SupabaseClient,
  clinicId: string,
  patientId: string,
): Promise<ActionResult<{ chart: ToothChart }>> {
  const chart = await readToothChart(supabase, clinicId, patientId);
  if (!chart) return fail(UNAVAILABLE);
  revalidatePath("/pacijenti", "layout");
  return ok({ chart });
}

async function requireClinical(): Promise<MemberSession | null> {
  const member = await requireMember();
  if (member.role !== "owner" && member.role !== "dentist") return null;
  return member;
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
    console.error("tooth_chart_patient rejected:", result.error.code ?? "rejected");
    return "unavailable";
  }
  const id =
    result.data && typeof result.data === "object" && "id" in result.data && typeof result.data.id === "string"
      ? result.data.id
      : null;
  return id === patientId ? "found" : "missing";
}

function fieldErrorsFrom(error: ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key !== "string") continue;
    const list = result[key] ?? [];
    list.push(issue.message);
    result[key] = list;
  }
  return result;
}

function rpcStatus(data: unknown): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const status = (data as { status?: unknown }).status;
  return typeof status === "string" ? status : null;
}
