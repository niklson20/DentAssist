"use server";

import { revalidatePath } from "next/cache";
import type { ZodError } from "zod";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireOwner } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { legalDataSchema } from "./schema";

const LEGAL_PATH = "/podesavanja/pravni-podaci";
const SAVE_UNAVAILABLE = "Čuvanje trenutno nije moguće. Pokušajte ponovo.";

export async function saveLegalData(
  _previous: ActionResult<{ saved: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ saved: true }>> {
  const member = await requireOwner();
  const parsed = legalDataSchema.safeParse({
    taxId: formData.get("taxId"),
    registrationNumber: formData.get("registrationNumber"),
    licenseNumber: formData.get("licenseNumber"),
  });
  if (!parsed.success) {
    return fail("Proverite unete podatke.", fieldErrorsFrom(parsed.error));
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("clinics")
      .update({
        tax_id: parsed.data.taxId,
        registration_number: parsed.data.registrationNumber,
        license_number: parsed.data.licenseNumber,
      })
      .eq("id", member.clinicId)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      console.error("save_legal_data rejected:", error?.code ?? "missing row");
      return fail(SAVE_UNAVAILABLE);
    }

    revalidatePath(LEGAL_PATH);
    return ok({ saved: true });
  } catch (error) {
    console.error("save_legal_data failed:", error instanceof Error ? error.name : "unknown error");
    return fail(SAVE_UNAVAILABLE);
  }
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
