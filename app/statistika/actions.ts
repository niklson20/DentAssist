"use server";

import { z } from "zod";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireOwner } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const dentistIdSchema = z.string().uuid().nullable();

const ratingReviewSchema = z.object({
  appointment_id: z.string().uuid(),
  reviewer_name: z.string().min(1),
  dentist_name: z.string().min(1),
  clinic_rating: z.number().int().min(1).max(5),
  dentist_rating: z.number().int().min(1).max(5).nullable(),
  starts_at: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  reviewed_at: z.string().refine((value) => Number.isFinite(Date.parse(value))),
});

export type ClinicRatingReview = {
  appointmentId: string;
  reviewerName: string;
  dentistName: string;
  clinicRating: number;
  dentistRating: number | null;
  startsAt: string;
  reviewedAt: string;
};

const RATINGS_UNAVAILABLE = "Ocene trenutno nisu dostupne. Pokušajte ponovo.";

export async function loadClinicRatingDetails(
  input: string | null,
): Promise<ActionResult<ClinicRatingReview[]>> {
  const parsedDentistId = dentistIdSchema.safeParse(input);
  if (!parsedDentistId.success) {
    return fail(RATINGS_UNAVAILABLE);
  }

  const owner = await requireOwner();

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_clinic_rating_details", {
      p_clinic_id: owner.clinicId,
      p_dentist_id: parsedDentistId.data,
    });

    if (error || !Array.isArray(data)) {
      console.error("get_clinic_rating_details rejected:", error?.code ?? "invalid response");
      return fail(RATINGS_UNAVAILABLE);
    }

    const reviews: ClinicRatingReview[] = [];
    for (const row of data.slice(0, 5)) {
      const parsed = ratingReviewSchema.safeParse(row);
      if (!parsed.success) {
        console.error("get_clinic_rating_details returned an invalid row");
        return fail(RATINGS_UNAVAILABLE);
      }

      reviews.push({
        appointmentId: parsed.data.appointment_id,
        reviewerName: parsed.data.reviewer_name,
        dentistName: parsed.data.dentist_name,
        clinicRating: parsed.data.clinic_rating,
        dentistRating: parsed.data.dentist_rating,
        startsAt: parsed.data.starts_at,
        reviewedAt: parsed.data.reviewed_at,
      });
    }

    return ok(reviews);
  } catch (loadError) {
    console.error(
      "get_clinic_rating_details failed:",
      loadError instanceof Error ? loadError.name : "unknown",
    );
    return fail(RATINGS_UNAVAILABLE);
  }
}
