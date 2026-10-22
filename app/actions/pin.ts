"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ZodError } from "zod";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { getSessionKind, homePathFor } from "@/lib/auth";
import { verifyInviteCode } from "@/lib/clinic-invite";
import { deviceHash } from "@/lib/reception-device";
import { PIN_LOCK_ERROR, wrongPinMessage } from "@/lib/reception-pin-ui";
import { receptionPasswordSchema, receptionPinSchema } from "@/lib/schemas/pin";
import {
  clearReceptionPinFailures,
  createMagicLinkToken,
  readReceptionPin,
  recordReceptionPinFailure,
} from "@/lib/supabase/admin";
import {
  createSupabaseServerClient,
  REMEMBER_COOKIE,
  sessionCookieOptions,
} from "@/lib/supabase/server";
import { SESSION_GATE_COOKIE } from "@/proxy";

const UNAVAILABLE = "Prijava trenutno nije moguća. Pokušajte ponovo.";
const DEVICE_CLOSED = "Ovaj računar više nije povezan.";
const USE_PIN = "Unesite PIN.";
const WRONG_PASSWORD = "Pogrešna lozinka.";
const NOT_STAFF = "Ovaj nalog nije nalog osoblja ordinacije.";
const RATE_LIMIT = "Previše pokušaja. Pokušajte ponovo za nekoliko minuta.";

export async function signInWithPin(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = receptionPinSchema.safeParse({
    memberId: formData.get("memberId"),
    pin: formData.get("pin"),
  });
  if (!parsed.success) {
    return fail("Proverite unete podatke.", fieldErrorsFrom(parsed.error));
  }

  const hashed = await deviceHash();
  if (hashed.status === "unavailable") {
    return fail(UNAVAILABLE);
  }
  if (hashed.status === "missing") {
    return fail(DEVICE_CLOSED);
  }

  let destination: "/danas" | null = null;
  try {
    const record = await readReceptionPin(hashed.hash, parsed.data.memberId);
    if (record.status === "failed") {
      return fail(UNAVAILABLE);
    }
    if (record.status === "invalid") {
      return fail(DEVICE_CLOSED);
    }
    if (record.status === "password") {
      return fail(PIN_LOCK_ERROR);
    }

    const matches = await verifyInviteCode(record.pinHash, parsed.data.pin);
    if (!matches) {
      const failure = await recordReceptionPinFailure(hashed.hash, parsed.data.memberId);
      if (failure.status === "failed") {
        return fail(UNAVAILABLE);
      }
      if (failure.status === "invalid") {
        return fail(DEVICE_CLOSED);
      }
      if (failure.status === "password") {
        return fail(PIN_LOCK_ERROR);
      }
      return fail(wrongPinMessage(failure.attemptCount));
    }

    const opened = await openPinSession(record.email, record.userId);
    if (!opened.ok) {
      return opened;
    }
    const cleared = await clearReceptionPinFailures(hashed.hash, parsed.data.memberId);
    if (cleared.status !== "ok") {
      console.error("PIN attempt reset failed:", cleared.status);
    }
    destination = "/danas";
  } catch (error) {
    console.error("PIN sign-in failed:", error instanceof Error ? error.name : "unknown error");
    return fail(UNAVAILABLE);
  }

  if (!destination) {
    return fail(UNAVAILABLE);
  }
  redirect(destination);
}

export async function signInWithDevicePassword(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = receptionPasswordSchema.safeParse({
    memberId: formData.get("memberId"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return fail("Proverite unete podatke.", fieldErrorsFrom(parsed.error));
  }

  const hashed = await deviceHash();
  if (hashed.status === "unavailable") {
    return fail(UNAVAILABLE);
  }
  if (hashed.status === "missing") {
    return fail(DEVICE_CLOSED);
  }

  let destination: "/danas" | null = null;
  try {
    const record = await readReceptionPin(hashed.hash, parsed.data.memberId);
    if (record.status === "failed") {
      return fail(UNAVAILABLE);
    }
    if (record.status === "invalid") {
      return fail(DEVICE_CLOSED);
    }
    if (record.status !== "password") {
      return fail(USE_PIN);
    }

    const supabase = await createSupabaseServerClient({ remember: false });
    await supabase.auth.signOut({ scope: "local" });
    const signedIn = await supabase.auth.signInWithPassword({
      email: record.email,
      password: parsed.data.password,
    });
    if (signedIn.error) {
      return fail(passwordError(signedIn.error));
    }

    const opened = await bindStaffSession(supabase, record.userId);
    if (!opened.ok) {
      return opened;
    }
    const cleared = await clearReceptionPinFailures(hashed.hash, parsed.data.memberId);
    if (cleared.status !== "ok") {
      console.error("PIN attempt reset failed:", cleared.status);
    }
    destination = "/danas";
  } catch (error) {
    console.error("Device password sign-in failed:", error instanceof Error ? error.name : "unknown error");
    return fail(UNAVAILABLE);
  }

  if (!destination) {
    return fail(UNAVAILABLE);
  }
  redirect(destination);
}

async function openPinSession(email: string, userId: string): Promise<ActionResult> {
  const link = await createMagicLinkToken(email);
  if (link.status === "rate_limit") {
    return fail(RATE_LIMIT);
  }
  if (link.status !== "ok") {
    return fail(UNAVAILABLE);
  }
  if (link.userId.toLowerCase() !== userId.toLowerCase()) {
    console.error("PIN session rejected: user mismatch");
    return fail(UNAVAILABLE);
  }

  const supabase = await createSupabaseServerClient({ remember: false });
  await supabase.auth.signOut({ scope: "local" });
  const verified = await supabase.auth.verifyOtp({
    token_hash: link.token,
    type: link.otpType,
  });
  if (verified.error) {
    if (verified.error.code === "over_request_rate_limit" || verified.error.status === 429) {
      return fail(RATE_LIMIT);
    }
    console.error("PIN session rejected:", verified.error.code ?? verified.error.status ?? "unknown");
    return fail(UNAVAILABLE);
  }
  return bindStaffSession(supabase, userId);
}

async function bindStaffSession(supabase: SupabaseClient, userId: string): Promise<ActionResult> {
  const current = await supabase.auth.getUser();
  const signedInId = current.data.user?.id?.toLowerCase() ?? "";
  if (current.error || signedInId !== userId.toLowerCase()) {
    await supabase.auth.signOut({ scope: "local" });
    console.error("PIN session rejected: signed-in user mismatch");
    return fail(UNAVAILABLE);
  }

  const kind = await getSessionKind(supabase);
  const home = homePathFor(kind);
  const store = await cookies();
  if (home !== "/danas") {
    await supabase.auth.signOut({ scope: "local" });
    store.set(SESSION_GATE_COOKIE, "", sessionCookieOptions({ maxAge: 0 }, false));
    return fail(kind === "patient" ? NOT_STAFF : UNAVAILABLE);
  }

  store.set(REMEMBER_COOKIE, "0", sessionCookieOptions({}, false));
  store.set(SESSION_GATE_COOKIE, kind, sessionCookieOptions({}, false));
  return ok(undefined);
}

function passwordError(error: { code?: string; status?: number }): string {
  if (error.code === "invalid_credentials") {
    return WRONG_PASSWORD;
  }
  if (error.code === "over_request_rate_limit" || error.status === 429) {
    return RATE_LIMIT;
  }
  console.error("Device password rejected:", error.code ?? error.status ?? "unknown");
  return UNAVAILABLE;
}

function fieldErrorsFrom(error: ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    (result[field] ??= []).push(issue.message);
  }
  return result;
}
