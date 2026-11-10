"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z, type ZodError } from "zod";

import { fail, type ActionResult } from "@/lib/action-result";
import { requireMember } from "@/lib/auth";
import { createSupabaseServerClient, sessionCookieOptions } from "@/lib/supabase/server";
import { SESSION_GATE_COOKIE } from "@/proxy";

import { calendarDaySchema, calendarPath } from "./schema";

const CHECK_DATE = "Proverite unete podatke.";
const SIGN_OUT_FAILED = "Odjava nije uspela. Pokušajte ponovo.";
const signOutSchema = z.object({});

export async function showCalendarDay(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const stomatolog = formData.get("stomatolog");
  const parsed = calendarDaySchema.safeParse({
    prikaz: formData.get("prikaz"),
    datum: formData.get("datum"),
    stomatolog: typeof stomatolog === "string" ? stomatolog : "",
  });
  if (!parsed.success) {
    return fail(CHECK_DATE, fieldErrorsFrom(parsed.error));
  }

  await requireMember();
  redirect(calendarPath(parsed.data));
}

export async function signOutStaff(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = signOutSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return fail(SIGN_OUT_FAILED);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      console.error("Sign-out rejected:", error.code ?? error.status ?? "unknown");
      return fail(SIGN_OUT_FAILED);
    }
    const store = await cookies();
    store.set(SESSION_GATE_COOKIE, "", sessionCookieOptions({ maxAge: 0 }, false));
  } catch (error) {
    console.error("Sign-out failed:", error instanceof Error ? error.message : "unknown error");
    return fail(SIGN_OUT_FAILED);
  }

  redirect("/prijava");
}

function fieldErrorsFrom(error: ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    (result[field] ??= []).push(issue.message);
  }
  return result;
}
