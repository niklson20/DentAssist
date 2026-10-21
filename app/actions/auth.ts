"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ZodError } from "zod";

import { fail, type ActionResult } from "@/lib/action-result";
import { getSessionKind, homePathFor, type StaffHome } from "@/lib/auth";
import { signInSchema } from "@/lib/schemas/auth";
import {
  createSupabaseServerClient,
  REMEMBER_COOKIE,
  sessionCookieOptions,
} from "@/lib/supabase/server";
import { SESSION_GATE_COOKIE } from "@/proxy";

const UNAVAILABLE = "Prijava trenutno nije moguća. Pokušajte ponovo.";

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

function fieldErrorsFrom(error: ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    (result[field] ??= []).push(issue.message);
  }
  return result;
}
