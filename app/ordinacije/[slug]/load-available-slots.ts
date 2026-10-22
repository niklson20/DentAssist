import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const dentistIdSchema = z.string().uuid();
const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

type SlotRow = {
  starts_at: string;
};

export async function loadAvailableSlots(
  slug: string,
  dentistId: string,
  day: string,
): Promise<string[]> {
  const trimmedSlug = slug.trim();
  const parsedDentist = dentistIdSchema.safeParse(dentistId);
  const parsedDay = daySchema.safeParse(day);
  if (!trimmedSlug || !parsedDentist.success || !parsedDay.success) {
    return [];
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_available_slots", {
      slug: trimmedSlug,
      dentist_id: parsedDentist.data,
      day: parsedDay.data,
    });

    if (error) {
      console.error("load_available_slots rejected:", error.message);
      return [];
    }

    return ((data as SlotRow[] | null) ?? [])
      .map((row) => row.starts_at)
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .sort((left, right) => left.localeCompare(right));
  } catch (loadError) {
    console.error(
      "load_available_slots failed:",
      loadError instanceof Error ? loadError.name : "unknown error",
    );
    return [];
  }
}
