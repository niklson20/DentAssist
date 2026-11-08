"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requirePatient } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const reviewSchema = z.object({
  appointmentId: z.string().uuid(),
  clinicRating: z.coerce.number().int().min(1).max(5),
  dentistRating: z.preprocess(
    (value) => (value === "" ? null : value),
    z.coerce.number().int().min(1).max(5).nullable(),
  ),
});

const REVIEW_UNAVAILABLE = "Ocena trenutno ne može da se sačuva. Pokušajte ponovo.";

export async function saveAppointmentReview(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = reviewSchema.safeParse({
    appointmentId: formData.get("appointmentId"),
    clinicRating: formData.get("clinicRating"),
    dentistRating: formData.get("dentistRating"),
  });
  if (!parsed.success) {
    return fail("Izaberite ocenu ordinacije od 1 do 5.");
  }

  await requirePatient({ purpose: "request" });
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("submit_appointment_review", {
      p_appointment_id: parsed.data.appointmentId,
      p_clinic_rating: parsed.data.clinicRating,
      p_dentist_rating: parsed.data.dentistRating,
    });

    if (error) {
      console.error("submit_appointment_review rejected:", error.code);
      return fail(REVIEW_UNAVAILABLE);
    }

    revalidatePath("/nalog/profil");
    return ok(undefined);
  } catch (saveError) {
    console.error(
      "submit_appointment_review failed:",
      saveError instanceof Error ? saveError.name : "unknown",
    );
    return fail(REVIEW_UNAVAILABLE);
  }
}
