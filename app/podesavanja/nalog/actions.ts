"use server";

import { revalidatePath } from "next/cache";
import type { ZodError } from "zod";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireMember } from "@/lib/auth";
import { hashInviteCode, isInviteCodeHash } from "@/lib/clinic-invite";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { ownPinWriteStatus } from "./pin-status";
import { accountPasswordSchema, accountPinSchema } from "./schema";

const SAVE_UNAVAILABLE = "Čuvanje trenutno nije moguće. Pokušajte ponovo.";
const OTHER_PASSWORD = "Izaberite drugu lozinku.";
const RATE_LIMIT = "Previše pokušaja. Pokušajte ponovo za nekoliko minuta.";
const PIN_ALREADY = "PIN je već sačuvan.";
const ACCOUNT_PATH = "/podesavanja/nalog";

export async function changeAccountPassword(
  _previous: ActionResult<{ saved: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ saved: true }>> {
  await requireMember();
  const parsed = accountPasswordSchema.safeParse({
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return fail("Proverite unete podatke.", fieldErrorsFrom(parsed.error));
  }

  try {
    const supabase = await createSupabaseServerClient();
    const updated = await supabase.auth.updateUser({ password: parsed.data.password });
    if (updated.error) {
      console.error("Password update rejected:", updated.error.code ?? updated.error.status ?? "unknown");
      if (updated.error.code === "weak_password" || updated.error.code === "same_password") {
        return fail(OTHER_PASSWORD, { password: [OTHER_PASSWORD] });
      }
      if (updated.error.code === "over_request_rate_limit" || updated.error.status === 429) {
        return fail(RATE_LIMIT);
      }
      return fail(SAVE_UNAVAILABLE);
    }
  } catch (error) {
    console.error("Password update failed:", error instanceof Error ? error.name : "unknown error");
    return fail(SAVE_UNAVAILABLE);
  }

  return ok({ saved: true });
}

export async function setAccountPin(
  _previous: ActionResult<{ saved: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ saved: true }>> {
  await requireMember();
  const parsed = accountPinSchema.safeParse({
    pin: formData.get("pin"),
  });
  if (!parsed.success) {
    return fail("Proverite unete podatke.", fieldErrorsFrom(parsed.error));
  }

  try {
    const pinHash = await hashInviteCode(parsed.data.pin);
    if (!isInviteCodeHash(pinHash)) {
      console.error("set_own_pin rejected: hash");
      return fail(SAVE_UNAVAILABLE);
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("set_own_pin", { p_pin_hash: pinHash });
    if (error) {
      console.error("set_own_pin rejected:", error.code ?? "unknown");
      return fail(SAVE_UNAVAILABLE);
    }

    const status = ownPinWriteStatus(data);
    if (status === "already_set") {
      revalidatePath(ACCOUNT_PATH);
      return fail(PIN_ALREADY);
    }
    if (status !== "ok") {
      console.error("set_own_pin rejected:", status ?? "empty");
      return fail(SAVE_UNAVAILABLE);
    }
  } catch (error) {
    console.error("set_own_pin failed:", error instanceof Error ? error.name : "unknown error");
    return fail(SAVE_UNAVAILABLE);
  }

  revalidatePath(ACCOUNT_PATH);
  return ok({ saved: true });
}

function fieldErrorsFrom(error: ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    (result[field] ??= []).push(issue.message);
  }
  return result;
}
