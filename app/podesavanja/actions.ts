"use server";

import { cookies } from "next/headers";
import type { ZodError } from "zod";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireMember } from "@/lib/auth";
import { verifyInviteCode } from "@/lib/clinic-invite";
import { REMEMBER_COOKIE, sessionCookieOptions } from "@/lib/supabase/cookies";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { parseOwnerSettingsPin, sessionIdFromClaims, SETTINGS_PIN_COOKIE } from "./pin-gate";
import { settingsPinSchema } from "./pin-schema";

const UNAVAILABLE = "PIN trenutno nije dostupan. Pokušajte ponovo.";
const WRONG_PIN = "Pogrešan PIN.";
const PIN_UNSET = "Prvo postavite PIN na stranici Nalog.";

export async function unlockSettingsPin(
  _previous: ActionResult<{ unlocked: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ unlocked: true }>> {
  const member = await requireMember();
  if (member.role !== "owner") {
    return fail(UNAVAILABLE);
  }

  const parsed = settingsPinSchema.safeParse({ pin: formData.get("pin") });
  if (!parsed.success) {
    return fail("Proverite unete podatke.", fieldErrorsFrom(parsed.error));
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("read_owner_settings_pin");
    if (error) {
      console.error("read_owner_settings_pin rejected:", error.code ?? "unknown");
      return fail(UNAVAILABLE);
    }

    const record = parseOwnerSettingsPin(data);
    if (record.status === "unset") {
      return fail(PIN_UNSET);
    }
    if (record.status !== "ready") {
      console.error("read_owner_settings_pin rejected:", record.status);
      return fail(UNAVAILABLE);
    }

    const matches = await verifyInviteCode(record.pinHash, parsed.data.pin);
    if (!matches) {
      return fail(WRONG_PIN, { pin: [WRONG_PIN] });
    }

    const claims = await supabase.auth.getClaims();
    const sessionId = claims.error ? null : sessionIdFromClaims(claims.data?.claims);
    if (!sessionId) {
      console.error("read_owner_settings_pin rejected: session");
      return fail(UNAVAILABLE);
    }

    const store = await cookies();
    const remember = store.get(REMEMBER_COOKIE)?.value === "1";
    store.set(SETTINGS_PIN_COOKIE, sessionId, sessionCookieOptions({}, remember));
  } catch (error) {
    console.error("unlock_settings_pin failed:", error instanceof Error ? error.name : "unknown error");
    return fail(UNAVAILABLE);
  }

  return ok({ unlocked: true });
}

function fieldErrorsFrom(error: ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    (result[field] ??= []).push(issue.message);
  }
  return result;
}
