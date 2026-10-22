"use server";

import { z } from "zod";

import { ok, fail, type ActionResult } from "@/lib/action-result";
import { getSessionKind } from "@/lib/auth";

import { loadAvailableSlots } from "./load-available-slots";

const requestSchema = z.object({
  slug: z.string().trim().min(1),
  dentistId: z.string().uuid(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function fetchAvailableSlots(
  input: z.infer<typeof requestSchema>,
): Promise<ActionResult<{ startsAt: string[] }>> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Proverite unete podatke.");
  }

  const sessionKind = await getSessionKind();
  if (sessionKind !== "patient") {
    return fail("Prijavite se da vidite slobodne termine.");
  }

  const startsAt = await loadAvailableSlots(parsed.data.slug, parsed.data.dentistId, parsed.data.day);
  return ok({ startsAt });
}
