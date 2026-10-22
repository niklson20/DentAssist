"use server";

import { createHmac } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import type { ZodError } from "zod";
import { z } from "zod";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const EMAIL_REQUESTS_PER_HOUR = 3;
const IP_SUBMISSIONS_BEFORE_TURNSTILE = 10;
const ONE_HOUR_MS = 60 * 60 * 1000;

const PENDING_MESSAGE = "Zahtev sa ove adrese već čeka.";
const EMAIL_RATE_MESSAGE = "Previše zahteva sa ovog mejla. Pokušajte ponovo za sat vremena.";
const TURNSTILE_MESSAGE = "Potvrdite da niste robot.";
const UNAVAILABLE = "Slanje trenutno nije moguće. Pokušajte ponovo.";

const emailSchema = z
  .string({ error: "Unesite mejl." })
  .trim()
  .min(1, "Unesite mejl.")
  .toLowerCase()
  .pipe(z.email("Unesite ispravan mejl."));

const clinicAccessRequestSchema = z.object({
  email: emailSchema,
  city: z.string({ error: "Unesite grad." }).trim().min(1, "Unesite grad.").max(200, "Unesite grad."),
  turnstileToken: z.string().optional(),
});

export type ClinicAccessFormContext =
  | { status: "ready"; turnstileRequired: boolean; turnstileSiteKey: string | null }
  | { status: "unavailable" };

export async function loadClinicAccessFormContext(): Promise<ClinicAccessFormContext> {
  const ipHash = await resolveIpHash();
  if (!ipHash) {
    return { status: "unavailable" };
  }

  const service = createServiceClient();
  if (!service) {
    return { status: "unavailable" };
  }

  const turnstileRequired = await ipSubmissionCount(service, ipHash) >= IP_SUBMISSIONS_BEFORE_TURNSTILE;
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null;

  return { status: "ready", turnstileRequired, turnstileSiteKey: siteKey };
}

export async function requestClinicAccess(
  _previous: ActionResult<{ submitted: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ submitted: true }>> {
  const parsed = clinicAccessRequestSchema.safeParse({
    email: formData.get("email"),
    city: formData.get("city"),
    turnstileToken: readTurnstileToken(formData),
  });
  if (!parsed.success) {
    return fail("Proverite unete podatke.", fieldErrorsFrom(parsed.error));
  }

  const ipHash = await resolveIpHash();
  if (!ipHash) {
    return fail(UNAVAILABLE);
  }

  const service = createServiceClient();
  if (!service) {
    return fail(UNAVAILABLE);
  }

  const turnstileRequired = await ipSubmissionCount(service, ipHash) >= IP_SUBMISSIONS_BEFORE_TURNSTILE;
  if (turnstileRequired) {
    const token = parsed.data.turnstileToken?.trim() ?? "";
    if (!token) {
      return fail(TURNSTILE_MESSAGE, { turnstile: [TURNSTILE_MESSAGE] });
    }
    const verified = await verifyTurnstile(token, await clientIp());
    if (!verified) {
      return fail(TURNSTILE_MESSAGE, { turnstile: [TURNSTILE_MESSAGE] });
    }
  }

  if (await emailRequestCount(service, parsed.data.email) >= EMAIL_REQUESTS_PER_HOUR) {
    return fail(EMAIL_RATE_MESSAGE, { email: [EMAIL_RATE_MESSAGE] });
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return fail(UNAVAILABLE);
  }

  const { error } = await supabase.rpc("request_clinic_access", {
    email: parsed.data.email,
    city: parsed.data.city,
    ip_hash: ipHash,
  });

  if (error) {
    if (isDuplicateAccessBlock(error.message)) {
      return fail(PENDING_MESSAGE, { email: [PENDING_MESSAGE] });
    }
    console.error("request_clinic_access failed:", error.message);
    return fail(UNAVAILABLE);
  }

  return ok({ submitted: true });
}

function readTurnstileToken(formData: FormData): string | undefined {
  const value = formData.get("cf-turnstile-response") ?? formData.get("turnstileToken");
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isDuplicateAccessBlock(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("pending clinic access request") ||
    lower.includes("unused clinic invite already exists")
  );
}

async function resolveIpHash(): Promise<string | null> {
  const pepper = process.env.TOKEN_PEPPER?.trim();
  if (!pepper) {
    return null;
  }
  const ip = await clientIp();
  if (!ip) {
    return null;
  }
  return createHmac("sha256", pepper).update(ip).digest("hex");
}

async function clientIp(): Promise<string | null> {
  const headerStore = await headers();
  const forwarded = headerStore.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  const realIp = headerStore.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  if (host?.startsWith("localhost") || host?.startsWith("127.0.0.1")) {
    return "127.0.0.1";
  }
  return null;
}

function createServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return null;
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function emailRequestCount(client: SupabaseClient, email: string): Promise<number> {
  const since = new Date(Date.now() - ONE_HOUR_MS).toISOString();
  const { count, error } = await client
    .from("clinic_access_requests")
    .select("id", { count: "exact", head: true })
    .ilike("email", email)
    .gte("created_at", since);
  if (error) {
    console.error("clinic access email count failed:", error.message);
    return EMAIL_REQUESTS_PER_HOUR;
  }
  return count ?? 0;
}

async function ipSubmissionCount(client: SupabaseClient, ipHash: string): Promise<number> {
  const since = new Date(Date.now() - ONE_HOUR_MS).toISOString();
  const { count, error } = await client
    .from("clinic_access_requests")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", since);
  if (error) {
    console.error("clinic access ip count failed:", error.message);
    return IP_SUBMISSIONS_BEFORE_TURNSTILE;
  }
  return count ?? 0;
}

async function verifyTurnstile(token: string, remoteIp: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    console.error("Turnstile verify failed: TURNSTILE_SECRET_KEY is not set");
    return false;
  }

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) {
    body.set("remoteip", remoteIp);
  }

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) {
      return false;
    }
    const payload = (await response.json()) as { success?: boolean };
    return payload.success === true;
  } catch {
    return false;
  }
}

function fieldErrorsFrom(error: ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    (result[field] ??= []).push(issue.message);
  }
  return result;
}
