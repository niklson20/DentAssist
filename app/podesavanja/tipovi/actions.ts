"use server";

import { revalidatePath } from "next/cache";
import type { ZodError } from "zod";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireOwner } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  addAppointmentTypeSchema,
  appointmentTypeIdSchema,
  renameAppointmentTypeSchema,
} from "./schema";

const TYPES_PATH = "/podesavanja/tipovi";
const SAVE_UNAVAILABLE = "Radnja trenutno nije moguća. Pokušajte ponovo.";
const DEFAULT_DEACTIVATE =
  "Podrazumevani tip ne može biti ugašen. Prvo postavite drugi podrazumevani tip.";
const INACTIVE_DEFAULT = "Podrazumevani tip mora biti aktivan.";

export async function addAppointmentType(
  _previous: ActionResult<{ saved: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ saved: true }>> {
  const member = await requireOwner();
  const parsed = addAppointmentTypeSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return fail("Proverite unete podatke.", fieldErrorsFrom(parsed.error));
  }

  try {
    const supabase = await createSupabaseServerClient();
    const sortOrder = await nextSortOrder(supabase, member.clinicId);
    if (sortOrder === null) {
      return fail(SAVE_UNAVAILABLE);
    }

    const { data: inserted, error: insertError } = await supabase
      .from("appointment_types")
      .insert({
        clinic_id: member.clinicId,
        name: parsed.data.name,
        sort_order: sortOrder,
        active: true,
      })
      .select("id")
      .single();

    if (insertError || !inserted?.id) {
      console.error("add_appointment_type insert failed:", insertError?.code ?? "missing row");
      return fail(SAVE_UNAVAILABLE);
    }

    const clinic = await supabase
      .from("clinics")
      .select("default_appointment_type_id")
      .eq("id", member.clinicId)
      .maybeSingle();

    if (clinic.error) {
      console.error("add_appointment_type clinic read failed:", clinic.error.code);
      return fail(SAVE_UNAVAILABLE);
    }

    if (clinic.data?.default_appointment_type_id === null) {
      const { error: defaultError } = await supabase
        .from("clinics")
        .update({ default_appointment_type_id: inserted.id })
        .eq("id", member.clinicId);
      if (defaultError) {
        console.error("add_appointment_type default failed:", defaultError.code);
        return fail(SAVE_UNAVAILABLE);
      }
    }

    revalidatePath(TYPES_PATH);
    return ok({ saved: true });
  } catch (error) {
    console.error("add_appointment_type failed:", error instanceof Error ? error.name : "unknown error");
    return fail(SAVE_UNAVAILABLE);
  }
}

export async function renameAppointmentType(
  _previous: ActionResult<{ saved: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ saved: true }>> {
  const member = await requireOwner();
  const parsed = renameAppointmentTypeSchema.safeParse({
    typeId: formData.get("typeId"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return fail("Proverite unete podatke.", fieldErrorsFrom(parsed.error));
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("appointment_types")
      .update({ name: parsed.data.name })
      .eq("id", parsed.data.typeId)
      .eq("clinic_id", member.clinicId)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      console.error("rename_appointment_type rejected:", error?.code ?? "missing row");
      return fail(SAVE_UNAVAILABLE);
    }

    revalidatePath(TYPES_PATH);
    return ok({ saved: true });
  } catch (error) {
    console.error(
      "rename_appointment_type failed:",
      error instanceof Error ? error.name : "unknown error",
    );
    return fail(SAVE_UNAVAILABLE);
  }
}

export async function deactivateAppointmentType(
  _previous: ActionResult<{ saved: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ saved: true }>> {
  const member = await requireOwner();
  const parsed = appointmentTypeIdSchema.safeParse({ typeId: formData.get("typeId") });
  if (!parsed.success) {
    return fail("Proverite unete podatke.", fieldErrorsFrom(parsed.error));
  }

  try {
    const supabase = await createSupabaseServerClient();
    const clinic = await supabase
      .from("clinics")
      .select("default_appointment_type_id")
      .eq("id", member.clinicId)
      .maybeSingle();

    if (clinic.error) {
      return fail(SAVE_UNAVAILABLE);
    }

    if (clinic.data?.default_appointment_type_id === parsed.data.typeId) {
      return fail(DEFAULT_DEACTIVATE);
    }

    const { data, error } = await supabase
      .from("appointment_types")
      .update({ active: false })
      .eq("id", parsed.data.typeId)
      .eq("clinic_id", member.clinicId)
      .eq("active", true)
      .select("id")
      .maybeSingle();

    if (error) {
      if (error.code === "P0001" || error.message.includes("cannot deactivate the default")) {
        return fail(DEFAULT_DEACTIVATE);
      }
      console.error("deactivate_appointment_type rejected:", error.code);
      return fail(SAVE_UNAVAILABLE);
    }

    if (!data) {
      return fail(SAVE_UNAVAILABLE);
    }

    revalidatePath(TYPES_PATH);
    return ok({ saved: true });
  } catch (error) {
    console.error(
      "deactivate_appointment_type failed:",
      error instanceof Error ? error.name : "unknown error",
    );
    return fail(SAVE_UNAVAILABLE);
  }
}

export async function setDefaultAppointmentType(
  _previous: ActionResult<{ saved: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ saved: true }>> {
  const member = await requireOwner();
  const parsed = appointmentTypeIdSchema.safeParse({ typeId: formData.get("typeId") });
  if (!parsed.success) {
    return fail("Proverite unete podatke.", fieldErrorsFrom(parsed.error));
  }

  try {
    const supabase = await createSupabaseServerClient();
    const type = await supabase
      .from("appointment_types")
      .select("id, active")
      .eq("id", parsed.data.typeId)
      .eq("clinic_id", member.clinicId)
      .maybeSingle();

    if (type.error || !type.data || type.data.active !== true) {
      return fail(INACTIVE_DEFAULT);
    }

    const { data, error } = await supabase
      .from("clinics")
      .update({ default_appointment_type_id: parsed.data.typeId })
      .eq("id", member.clinicId)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      console.error("set_default_appointment_type rejected:", error?.code ?? "missing row");
      return fail(SAVE_UNAVAILABLE);
    }

    revalidatePath(TYPES_PATH);
    return ok({ saved: true });
  } catch (error) {
    console.error(
      "set_default_appointment_type failed:",
      error instanceof Error ? error.name : "unknown error",
    );
    return fail(SAVE_UNAVAILABLE);
  }
}

async function nextSortOrder(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  clinicId: string,
): Promise<number | null> {
  const { data, error } = await supabase
    .from("appointment_types")
    .select("sort_order")
    .eq("clinic_id", clinicId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("next_sort_order failed:", error.code);
    return null;
  }

  if (!data || typeof data.sort_order !== "number") {
    return 0;
  }
  return data.sort_order + 1;
}

function fieldErrorsFrom(error: ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    fieldErrors[key] = fieldErrors[key] ?? [];
    fieldErrors[key].push(issue.message);
  }
  return fieldErrors;
}
