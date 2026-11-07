import { z } from "zod";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PATIENT_NAME_UNAVAILABLE = "Ime i prezime trenutno nisu dostupni.";

const accountIdSchema = z.string().uuid();
const patientNameSchema = z.object({
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
});

export type PatientName = {
  firstName: string;
  lastName: string;
};

export async function loadPatientName(accountId: string): Promise<ActionResult<PatientName>> {
  const parsedId = accountIdSchema.safeParse(accountId);
  if (!parsedId.success) {
    return fail(PATIENT_NAME_UNAVAILABLE);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("patient_accounts")
      .select("first_name, last_name")
      .eq("id", parsedId.data)
      .maybeSingle();

    if (error) {
      console.error("patient profile name read rejected:", error.code ?? "rejected");
      return fail(PATIENT_NAME_UNAVAILABLE);
    }

    const parsedName = patientNameSchema.safeParse(data);
    if (!parsedName.success) {
      console.error("patient profile name unavailable:", data ? "invalid row" : "missing row");
      return fail(PATIENT_NAME_UNAVAILABLE);
    }

    return ok({
      firstName: parsedName.data.first_name,
      lastName: parsedName.data.last_name,
    });
  } catch (loadError) {
    console.error(
      "patient profile name read failed:",
      loadError instanceof Error ? loadError.name : "unknown",
    );
    return fail(PATIENT_NAME_UNAVAILABLE);
  }
}
