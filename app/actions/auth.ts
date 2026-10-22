"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ZodError } from "zod";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { getSessionKind, homePathFor, type StaffHome } from "@/lib/auth";
import { MailError, sendMail } from "@/lib/mail";
import { passwordResetLink, passwordResetText, PASSWORD_RESET_SUBJECT, pathAfterPasswordReset } from "@/lib/password-reset";
import { newPasswordSchema, passwordResetRequestSchema, signInSchema } from "@/lib/schemas/auth";
import { createRecoveryToken } from "@/lib/supabase/admin";
import {
  createSupabaseServerClient,
  REMEMBER_COOKIE,
  sessionCookieOptions,
} from "@/lib/supabase/server";
import { SESSION_GATE_COOKIE } from "@/proxy";

const UNAVAILABLE = "Prijava trenutno nije moguća. Pokušajte ponovo.";
const RESET_UNAVAILABLE = "Slanje trenutno nije moguće. Pokušajte ponovo.";
const SAVE_UNAVAILABLE = "Lozinka trenutno ne može da se sačuva. Pokušajte ponovo.";
const LINK_INVALID = "Ovaj link više ne važi.";
const OTHER_PASSWORD = "Izaberite drugu lozinku.";
const RATE_LIMIT = "Previše pokušaja. Pokušajte ponovo za nekoliko minuta.";

export async function signIn(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    remember: formData.get("remember") === "on",
  });
  if (!parsed.success) {
    return fail("Proverite unete podatke.", fieldErrorsFrom(parsed.error));
  }
  const { email, password, remember } = parsed.data;

  let destination: StaffHome;
  try {
    const supabase = await createSupabaseServerClient({ remember });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return fail(signInErrorMessage(error));
    }

    const kind = await getSessionKind(supabase);
    const home = homePathFor(kind);
    const store = await cookies();
    if (!home) {
      // Only staff and platform accounts may hold a session from this form.
      await supabase.auth.signOut({ scope: "local" });
      store.set(SESSION_GATE_COOKIE, "", sessionCookieOptions({ maxAge: 0 }, false));
      return fail(kind === "patient" ? "Ovaj nalog nije nalog osoblja ordinacije." : UNAVAILABLE);
    }

    store.set(REMEMBER_COOKIE, remember ? "1" : "0", sessionCookieOptions({}, remember));
    store.set(SESSION_GATE_COOKIE, kind, sessionCookieOptions({}, remember));
    destination = home;
  } catch (error) {
    console.error("Sign-in failed:", error instanceof Error ? error.message : "unknown error");
    return fail(UNAVAILABLE);
  }

  redirect(destination);
}

function signInErrorMessage(error: { code?: string; status?: number }): string {
  if (error.code === "invalid_credentials") {
    return "Pogrešan mejl ili lozinka.";
  }
  if (error.code === "over_request_rate_limit" || error.status === 429) {
    return "Previše pokušaja. Pokušajte ponovo za nekoliko minuta.";
  }
  console.error("Sign-in rejected:", error.code ?? error.status ?? "unknown");
  return UNAVAILABLE;
}

export async function requestPasswordReset(
  _previous: ActionResult<{ sent: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ sent: true }>> {
  const parsed = passwordResetRequestSchema.safeParse({
    email: formData.get("email"),
    audience: formData.get("audience"),
    clinicSlug: formData.get("clinicSlug"),
  });
  if (!parsed.success) {
    return fail("Proverite unete podatke.", fieldErrorsFrom(parsed.error));
  }

  const origin = await requestOrigin();
  const linkInput = {
    audience: parsed.data.audience,
    clinicSlug: parsed.data.clinicSlug,
    appUrl: process.env.APP_URL,
    staffUrl: process.env.STAFF_URL,
    origin,
  };
  if (!passwordResetLink({ ...linkInput, token: "pending" })) {
    return fail(RESET_UNAVAILABLE);
  }

  const issued = await createRecoveryToken(parsed.data.email);
  if (issued.status === "missing") {
    return ok({ sent: true });
  }
  if (issued.status === "rate_limit") {
    return fail(RATE_LIMIT);
  }
  if (issued.status !== "ok") {
    return fail(RESET_UNAVAILABLE);
  }

  const link = passwordResetLink({ ...linkInput, token: issued.token });
  if (!link) {
    return fail(RESET_UNAVAILABLE);
  }

  try {
    await sendMail({
      to: parsed.data.email,
      subject: PASSWORD_RESET_SUBJECT,
      text: passwordResetText(link),
    });
  } catch (error) {
    if (error instanceof MailError && error.code === "rate_limit_exceeded") {
      return fail(RATE_LIMIT);
    }
    console.error("Password reset mail failed:", error instanceof Error ? error.name : "unknown error");
    return fail(RESET_UNAVAILABLE);
  }

  return ok({ sent: true });
}

export async function setNewPassword(
  _previous: ActionResult<{ saved: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ saved: true }>> {
  const parsed = newPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    clinicSlug: formData.get("clinicSlug"),
  });
  if (!parsed.success) {
    const tokenInvalid = parsed.error.issues.some((issue) => issue.path[0] === "token");
    return fail(tokenInvalid ? LINK_INVALID : "Proverite unete podatke.", fieldErrorsFrom(parsed.error));
  }

  let destination: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const verified = await supabase.auth.verifyOtp({
      token_hash: parsed.data.token,
      type: "recovery",
    });
    if (verified.error) {
      const existing = await supabase.auth.getUser();
      if (existing.error || !existing.data.user) {
        console.error("Recovery token rejected:", verified.error.code ?? verified.error.status ?? "unknown");
        return fail(LINK_INVALID);
      }
    }

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

    const kind = await getSessionKind(supabase);
    await supabase.auth.signOut({ scope: "local" });
    const store = await cookies();
    store.set(SESSION_GATE_COOKIE, "", sessionCookieOptions({ maxAge: 0 }, false));
    destination = pathAfterPasswordReset(kind, parsed.data.clinicSlug);
  } catch (error) {
    console.error("Password reset failed:", error instanceof Error ? error.message : "unknown error");
    return fail(SAVE_UNAVAILABLE);
  }

  if (!destination) {
    return ok({ saved: true });
  }
  redirect(destination);
}

async function requestOrigin(): Promise<string | null> {
  const headerStore = await headers();
  const origin = headerStore.get("origin");
  if (origin) {
    return origin;
  }
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  if (!host) {
    return null;
  }
  const forwarded = headerStore.get("x-forwarded-proto");
  const proto = forwarded ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}

function fieldErrorsFrom(error: ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    (result[field] ??= []).push(issue.message);
  }
  return result;
}
