"use server";

import { createHmac } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ZodError } from "zod";

import {
  CLINIC_UNAVAILABLE,
  PATIENT_EMAIL_CODE_SUBJECT,
  patientEmailCodeSchema,
  patientEmailCodeText,
  patientEmailResendSchema,
  patientRegisterSchema,
  patientSignInSchema,
} from "@/app/ordinacije/[slug]/registracija/schema";
import { loadClinicPublic } from "@/app/ordinacije/[slug]/load-clinic-public";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { getSessionKind, patientAuthPath, patientReturnPath, type PatientReturnQuery } from "@/lib/auth";
import { hashInviteCode, randomInviteCode } from "@/lib/clinic-invite";
import { MailError, sendMail } from "@/lib/mail";
import { normalizeClinicSlug } from "@/lib/password-reset";
import { createConfirmedUser, deleteAuthUser } from "@/lib/supabase/admin";
import { createSupabaseServerClient, REMEMBER_COOKIE, sessionCookieOptions } from "@/lib/supabase/server";
import { hasAuthSession, SESSION_GATE_COOKIE } from "@/proxy";

const EMAIL_SENDS_PER_HOUR = 3;
const NETWORK_SENDS_BEFORE_TURNSTILE = 10;

const CHECK = "Proverite unete podatke.";
const UNAVAILABLE = "Prijava trenutno nije moguća. Pokušajte ponovo.";
const REGISTER_UNAVAILABLE = "Registracija trenutno nije moguća. Pokušajte ponovo.";
const CODE_UNAVAILABLE = "Kod trenutno ne može da se pošalje. Pokušajte ponovo.";
const WRONG_PASSWORD = "Pogrešan mejl ili lozinka.";
const NOT_PATIENT = "Ovaj nalog nije nalog pacijenta.";
const EMAIL_TAKEN = "Ovaj mejl već ima nalog. Prijavite se.";
const OTHER_PASSWORD = "Izaberite drugu lozinku.";
const RATE_LIMIT = "Previše pokušaja. Pokušajte ponovo za nekoliko minuta.";
const SEND_LIMIT = "Kod može da se pošalje najviše tri puta na sat.";
const TURNSTILE_MESSAGE = "Potvrdite da niste robot.";
const WRONG_CODE = "Pogrešan kod.";
const CODE_DEAD = "Kod više ne važi. Zatražite novi.";
const OTHER_ACCOUNT = "Već ste prijavljeni drugim nalogom.";

type Gate = "staff" | "platform" | "patient";

type AccountRow = {
  id: string;
  email: string;
  emailConfirmedAt: string | null;
};

type AccountLookup = { status: "ok"; account: AccountRow | null } | { status: "failed" };

type SendCodeResult =
  | { kind: "sent" }
  | { kind: "confirmed" }
  | { kind: "fail"; result: ActionResult<never> };

type RegisterOutcome =
  | { type: "redirect"; path: string }
  | { type: "result"; result: ActionResult<{ step: "code" }> };

export async function signInPatient(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = patientSignInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    slug: formData.get("slug"),
    stomatolog: formData.get("stomatolog"),
    pocetak: formData.get("pocetak"),
  });
  if (!parsed.success) {
    return fail(CHECK, fieldErrorsFrom(parsed.error));
  }

  const destination = await signInDestination(parsed.data);
  if (typeof destination !== "string") {
    return destination;
  }
  redirect(destination);
}

export async function registerPatient(
  _previous: ActionResult<{ step: "code" }> | null,
  formData: FormData,
): Promise<ActionResult<{ step: "code" }>> {
  const parsed = patientRegisterSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    password: formData.get("password"),
    slug: formData.get("slug"),
    stomatolog: formData.get("stomatolog"),
    pocetak: formData.get("pocetak"),
    turnstileToken: readTurnstileToken(formData),
  });
  if (!parsed.success) {
    return fail(CHECK, fieldErrorsFrom(parsed.error));
  }

  const outcome = await registerOutcome(parsed.data);
  if (outcome.type === "redirect") {
    redirect(outcome.path);
  }
  return outcome.result;
}

export async function confirmPatientEmail(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = patientEmailCodeSchema.safeParse({
    code: formData.get("code"),
    slug: formData.get("slug"),
    stomatolog: formData.get("stomatolog"),
    pocetak: formData.get("pocetak"),
    turnstileToken: readTurnstileToken(formData),
  });
  if (!parsed.success) {
    const codeInvalid = parsed.error.issues.some((issue) => issue.path[0] === "code");
    return fail(codeInvalid ? "Unesite kod od 6 cifara." : CHECK, fieldErrorsFrom(parsed.error));
  }

  const destination = await confirmDestination(parsed.data.code, parsed.data);
  if (typeof destination !== "string") {
    return destination;
  }
  redirect(destination);
}

export async function resendPatientEmailCode(
  _previous: ActionResult<{ step: "code" }> | null,
  formData: FormData,
): Promise<ActionResult<{ step: "code" }>> {
  const parsed = patientEmailResendSchema.safeParse({
    slug: formData.get("slug"),
    stomatolog: formData.get("stomatolog"),
    pocetak: formData.get("pocetak"),
    turnstileToken: readTurnstileToken(formData),
  });
  if (!parsed.success) {
    return fail(CHECK, fieldErrorsFrom(parsed.error));
  }

  const destination = await resendDestination(parsed.data);
  if (typeof destination !== "string") {
    return destination;
  }
  redirect(destination);
}

async function signInDestination(
  input: { email: string; password: string; slug: string; stomatolog?: string; pocetak?: string },
): Promise<string | ActionResult<never>> {
  try {
    const opened = await openClinic(input.slug);
    if (!opened) {
      return fail(CLINIC_UNAVAILABLE);
    }
    const query = readReturn(input);
    const supabase = await createSupabaseServerClient({ remember: false });
    const signedIn = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (signedIn.error) {
      return fail(signInErrorMessage(signedIn.error));
    }

    const user = await readAuthUser(supabase);
    if (!user) {
      return fail(UNAVAILABLE);
    }
    const lookup = await loadAccount(supabase, user.id);
    if (lookup.status === "failed") {
      return fail(UNAVAILABLE);
    }
    if (!lookup.account) {
      await supabase.auth.signOut({ scope: "local" });
      await clearGate();
      return fail(NOT_PATIENT);
    }

    const gate = await sessionGate(supabase);
    if (!gate) {
      return fail(UNAVAILABLE);
    }
    await writeGate(gate, true);
    if (!lookup.account.emailConfirmedAt) {
      return patientAuthPath(opened.slug, "registracija", query);
    }
    return patientReturnPath(opened.slug, query);
  } catch (error) {
    console.error("Patient sign-in failed:", error instanceof Error ? error.name : "unknown error");
    return fail(UNAVAILABLE);
  }
}

async function registerOutcome(input: {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  slug: string;
  stomatolog?: string;
  pocetak?: string;
  turnstileToken?: string;
}): Promise<RegisterOutcome> {
  let createdUserId: string | null = null;
  let accountSaved = false;
  try {
    const opened = await openClinic(input.slug);
    if (!opened) {
      return { type: "result", result: fail(CLINIC_UNAVAILABLE) };
    }
    const query = readReturn(input);
    const returnPath = patientReturnPath(opened.slug, query);
    const supabase = await patientClient();
    const existing = await readAuthUser(supabase);
    if (existing && existing.email !== input.email) {
      return { type: "result", result: fail(OTHER_ACCOUNT) };
    }

    let signedInNow = false;
    if (!existing) {
      const created = await createConfirmedUser(input.email, input.password);
      if (created.status === "weak_password") {
        return { type: "result", result: fail(OTHER_PASSWORD, { password: [OTHER_PASSWORD] }) };
      }
      if (created.status === "rate_limit") {
        return { type: "result", result: fail(RATE_LIMIT) };
      }
      if (created.status !== "ok" && created.status !== "exists") {
        return { type: "result", result: fail(REGISTER_UNAVAILABLE) };
      }
      if (created.status === "ok") {
        createdUserId = created.userId;
      }

      const signedIn = await supabase.auth.signInWithPassword({
        email: input.email,
        password: input.password,
      });
      if (signedIn.error) {
        if (createdUserId) {
          await deleteAuthUser(createdUserId);
          createdUserId = null;
        }
        if (created.status === "exists") {
          return { type: "result", result: fail(emailExistsMessage(signedIn.error)) };
        }
        return { type: "result", result: fail(REGISTER_UNAVAILABLE) };
      }
      signedInNow = true;
    }

    const user = await readAuthUser(supabase);
    if (!user || user.email !== input.email) {
      if (createdUserId) {
        await deleteAuthUser(createdUserId);
      }
      return { type: "result", result: fail(REGISTER_UNAVAILABLE) };
    }

    const saved = await ensureAccount(supabase, user.id, {
      email: user.email,
      firstName: input.firstName,
      lastName: input.lastName,
    });
    if (saved.status !== "ok") {
      if (createdUserId) {
        await deleteAuthUser(createdUserId);
        createdUserId = null;
      }
      return {
        type: "result",
        result: fail(saved.status === "taken" ? EMAIL_TAKEN : REGISTER_UNAVAILABLE),
      };
    }
    accountSaved = true;
    createdUserId = null;

    const gate = await sessionGate(supabase);
    if (!gate) {
      return { type: "result", result: fail(REGISTER_UNAVAILABLE) };
    }
    await writeGate(gate, signedInNow);

    if (saved.account.emailConfirmedAt) {
      return { type: "redirect", path: returnPath };
    }

    const sent = await sendConfirmationCode(supabase, user.email, input.turnstileToken);
    if (sent.kind === "confirmed") {
      return { type: "redirect", path: returnPath };
    }
    if (sent.kind === "fail") {
      // A new session would refresh the page into the code step and hide this error.
      if (signedInNow) {
        await supabase.auth.signOut({ scope: "local" });
        await clearGate();
      }
      return { type: "result", result: sent.result };
    }
    return { type: "result", result: ok({ step: "code" }) };
  } catch (error) {
    console.error("Patient registration failed:", error instanceof Error ? error.name : "unknown error");
    if (createdUserId && !accountSaved) {
      await deleteAuthUser(createdUserId);
    }
    return { type: "result", result: fail(REGISTER_UNAVAILABLE) };
  }
}

async function confirmDestination(
  code: string,
  input: { slug: string; stomatolog?: string; pocetak?: string },
): Promise<string | ActionResult<never>> {
  try {
    const opened = await openClinic(input.slug);
    if (!opened) {
      return fail(CLINIC_UNAVAILABLE);
    }
    const query = readReturn(input);
    const supabase = await patientClient();
    const user = await readAuthUser(supabase);
    if (!user) {
      return fail(UNAVAILABLE);
    }
    const lookup = await loadAccount(supabase, user.id);
    if (lookup.status === "failed") {
      return fail(CODE_UNAVAILABLE);
    }
    if (!lookup.account) {
      return fail(NOT_PATIENT);
    }
    if (lookup.account.emailConfirmedAt) {
      return patientReturnPath(opened.slug, query);
    }

    const { data, error } = await supabase.rpc("confirm_patient_email", { p_code: code });
    if (error) {
      console.error("confirm_patient_email rejected:", error.code ?? "unknown");
      return fail(CODE_UNAVAILABLE);
    }
    const status = readStatus(data);
    if (status === "ok" || status === "already_confirmed") {
      return patientReturnPath(opened.slug, query);
    }
    if (status === "wrong") {
      return fail(WRONG_CODE, { code: [WRONG_CODE] });
    }
    return fail(CODE_DEAD, { code: [CODE_DEAD] });
  } catch (error) {
    console.error("Patient email confirm failed:", error instanceof Error ? error.name : "unknown error");
    return fail(CODE_UNAVAILABLE);
  }
}

async function resendDestination(input: {
  slug: string;
  stomatolog?: string;
  pocetak?: string;
  turnstileToken?: string;
}): Promise<string | ActionResult<{ step: "code" }>> {
  try {
    const opened = await openClinic(input.slug);
    if (!opened) {
      return fail(CLINIC_UNAVAILABLE);
    }
    const query = readReturn(input);
    const supabase = await patientClient();
    const user = await readAuthUser(supabase);
    if (!user) {
      return fail(UNAVAILABLE);
    }
    const lookup = await loadAccount(supabase, user.id);
    if (lookup.status === "failed") {
      return fail(CODE_UNAVAILABLE);
    }
    if (!lookup.account) {
      return fail(NOT_PATIENT);
    }
    if (lookup.account.emailConfirmedAt) {
      return patientReturnPath(opened.slug, query);
    }

    const sent = await sendConfirmationCode(supabase, lookup.account.email, input.turnstileToken);
    if (sent.kind === "confirmed") {
      return patientReturnPath(opened.slug, query);
    }
    if (sent.kind === "fail") {
      return sent.result;
    }
    return ok({ step: "code" });
  } catch (error) {
    console.error("Patient email resend failed:", error instanceof Error ? error.name : "unknown error");
    return fail(CODE_UNAVAILABLE);
  }
}

async function sendConfirmationCode(
  supabase: SupabaseClient,
  email: string,
  turnstileToken: string | undefined,
): Promise<SendCodeResult> {
  const ipHash = await resolveIpHash();
  if (!ipHash) {
    console.error("Patient email code failed: TOKEN_PEPPER or client IP is missing");
    return { kind: "fail", result: fail(CODE_UNAVAILABLE) };
  }

  const quota = await supabase.rpc("patient_email_challenge_quota", { p_ip_hash: ipHash });
  if (quota.error) {
    console.error("patient_email_challenge_quota rejected:", quota.error.code ?? "unknown");
    return { kind: "fail", result: fail(CODE_UNAVAILABLE) };
  }
  const quotaStatus = readStatus(quota.data);
  if (quotaStatus !== "ok") {
    return { kind: "fail", result: fail(CODE_UNAVAILABLE) };
  }
  const emailSends = readCount(quota.data, "email_sends");
  const networkSends = readCount(quota.data, "network_sends");
  if (emailSends === null || networkSends === null) {
    return { kind: "fail", result: fail(CODE_UNAVAILABLE) };
  }
  if (emailSends >= EMAIL_SENDS_PER_HOUR) {
    return { kind: "fail", result: fail(SEND_LIMIT) };
  }
  if (networkSends >= NETWORK_SENDS_BEFORE_TURNSTILE) {
    const token = turnstileToken?.trim() ?? "";
    if (!token || !(await verifyTurnstile(token, await clientIp()))) {
      return { kind: "fail", result: fail(TURNSTILE_MESSAGE, { turnstile: [TURNSTILE_MESSAGE] }) };
    }
  }

  const code = randomInviteCode();
  const codeHash = await hashInviteCode(code);
  const started = await supabase.rpc("start_patient_email_challenge", {
    p_code_hash: codeHash,
    p_ip_hash: ipHash,
  });
  if (started.error) {
    console.error("start_patient_email_challenge rejected:", started.error.code ?? "unknown");
    return { kind: "fail", result: fail(CODE_UNAVAILABLE) };
  }
  const startedStatus = readStatus(started.data);
  if (startedStatus === "already_confirmed") {
    return { kind: "confirmed" };
  }
  if (startedStatus === "rate_limit") {
    return { kind: "fail", result: fail(SEND_LIMIT) };
  }
  if (startedStatus !== "ok") {
    return { kind: "fail", result: fail(CODE_UNAVAILABLE) };
  }

  try {
    await sendMail({
      to: email,
      subject: PATIENT_EMAIL_CODE_SUBJECT,
      text: patientEmailCodeText(code),
    });
  } catch (error) {
    await abandonChallenge(supabase, codeHash);
    if (error instanceof MailError && error.code === "rate_limit_exceeded") {
      return { kind: "fail", result: fail(RATE_LIMIT) };
    }
    console.error("Patient email code mail failed:", error instanceof Error ? error.name : "unknown error");
    return { kind: "fail", result: fail(CODE_UNAVAILABLE) };
  }

  return { kind: "sent" };
}

async function abandonChallenge(supabase: SupabaseClient, codeHash: string): Promise<void> {
  try {
    const abandoned = await supabase.rpc("abandon_patient_email_challenge", { p_code_hash: codeHash });
    if (abandoned.error) {
      console.error("abandon_patient_email_challenge rejected:", abandoned.error.code ?? "unknown");
    }
  } catch (error) {
    console.error(
      "abandon_patient_email_challenge failed:",
      error instanceof Error ? error.name : "unknown error",
    );
  }
}

async function openClinic(slug: string): Promise<{ slug: string } | null> {
  const safeSlug = normalizeClinicSlug(slug);
  if (!safeSlug) {
    return null;
  }
  const loaded = await loadClinicPublic(safeSlug);
  if (loaded.status !== "ready") {
    return null;
  }
  return { slug: loaded.clinic.slug };
}

function readReturn(input: { stomatolog?: string; pocetak?: string }): PatientReturnQuery {
  return { stomatolog: input.stomatolog, pocetak: input.pocetak };
}

async function patientClient() {
  const store = await cookies();
  const signedIn = hasAuthSession(store.getAll());
  return createSupabaseServerClient({ remember: signedIn ? undefined : false });
}

async function readAuthUser(
  supabase: SupabaseClient,
): Promise<{ id: string; email: string } | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return null;
  }
  const email = data.user.email?.trim().toLowerCase() ?? "";
  if (!data.user.id || !email) {
    return null;
  }
  return { id: data.user.id, email };
}

async function loadAccount(supabase: SupabaseClient, userId: string): Promise<AccountLookup> {
  const { data, error } = await supabase
    .from("patient_accounts")
    .select("id, email, email_confirmed_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("patient_accounts read rejected:", error.code ?? "unknown");
    return { status: "failed" };
  }
  return { status: "ok", account: mapAccount(data) };
}

async function ensureAccount(
  supabase: SupabaseClient,
  userId: string,
  input: { email: string; firstName: string; lastName: string },
): Promise<{ status: "ok"; account: AccountRow } | { status: "taken" } | { status: "failed" }> {
  const existing = await loadAccount(supabase, userId);
  if (existing.status === "failed") {
    return { status: "failed" };
  }
  if (existing.account) {
    return { status: "ok", account: existing.account };
  }

  const inserted = await supabase
    .from("patient_accounts")
    .insert({
      user_id: userId,
      first_name: input.firstName,
      last_name: input.lastName,
      email: input.email,
    })
    .select("id, email, email_confirmed_at")
    .maybeSingle();
  if (inserted.error) {
    if (inserted.error.code === "23505") {
      const again = await loadAccount(supabase, userId);
      if (again.status === "ok" && again.account) {
        return { status: "ok", account: again.account };
      }
      if (again.status === "failed") {
        return { status: "failed" };
      }
      return { status: "taken" };
    }
    console.error("patient_accounts insert rejected:", inserted.error.code ?? "unknown");
    return { status: "failed" };
  }
  const account = mapAccount(inserted.data);
  return account ? { status: "ok", account } : { status: "failed" };
}

function mapAccount(data: unknown): AccountRow | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const row = data as { id?: unknown; email?: unknown; email_confirmed_at?: unknown };
  if (typeof row.id !== "string" || typeof row.email !== "string") {
    return null;
  }
  const confirmedAt = row.email_confirmed_at;
  return {
    id: row.id,
    email: row.email,
    emailConfirmedAt: typeof confirmedAt === "string" && confirmedAt.length > 0 ? confirmedAt : null,
  };
}

async function sessionGate(supabase: SupabaseClient): Promise<Gate | null> {
  const kind = await getSessionKind(supabase);
  if (kind === "staff" || kind === "platform" || kind === "patient") {
    return kind;
  }
  return null;
}

async function writeGate(gate: Gate, signedInNow: boolean): Promise<void> {
  const store = await cookies();
  const remember = !signedInNow && store.get(REMEMBER_COOKIE)?.value === "1";
  if (signedInNow) {
    store.set(REMEMBER_COOKIE, "0", sessionCookieOptions({}, false));
  }
  store.set(SESSION_GATE_COOKIE, gate, sessionCookieOptions({}, remember));
}

async function clearGate(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_GATE_COOKIE, "", sessionCookieOptions({ maxAge: 0 }, false));
}

function signInErrorMessage(error: { code?: string; status?: number }): string {
  if (error.code === "invalid_credentials") {
    return WRONG_PASSWORD;
  }
  if (error.code === "over_request_rate_limit" || error.status === 429) {
    return RATE_LIMIT;
  }
  console.error("Patient sign-in rejected:", error.code ?? error.status ?? "unknown");
  return UNAVAILABLE;
}

function emailExistsMessage(error: { code?: string; status?: number }): string {
  if (error.code === "over_request_rate_limit" || error.status === 429) {
    return RATE_LIMIT;
  }
  if (error.code !== "invalid_credentials") {
    console.error("Patient registration sign-in rejected:", error.code ?? error.status ?? "unknown");
  }
  return EMAIL_TAKEN;
}

function readTurnstileToken(formData: FormData): string | undefined {
  const value = formData.get("cf-turnstile-response") ?? formData.get("turnstileToken");
  return typeof value === "string" ? value : undefined;
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

function readStatus(data: unknown): string | null {
  const record = asRecord(data);
  const status = record?.status;
  return typeof status === "string" ? status : null;
}

function readCount(data: unknown, key: "email_sends" | "network_sends"): number | null {
  const value = asRecord(data)?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asRecord(data: unknown): Record<string, unknown> | null {
  if (typeof data === "string") {
    try {
      return asRecord(JSON.parse(data) as unknown);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== "object") {
    return null;
  }
  return data as Record<string, unknown>;
}

function fieldErrorsFrom(error: ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    (result[field] ??= []).push(issue.message);
  }
  return result;
}
