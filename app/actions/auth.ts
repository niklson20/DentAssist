"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ZodError } from "zod";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { getSessionKind, homePathFor, type StaffHome } from "@/lib/auth";
import {
  CLINIC_INVITE_SUBJECT,
  clinicInviteLink,
  clinicInviteText,
  hashInviteCode,
  hashInviteToken,
  randomInviteCode,
  staffInviteRoleLabel,
  staffInviteSubject,
  staffInviteText,
  verifyInviteCode,
} from "@/lib/clinic-invite";
import { MailError, sendMail } from "@/lib/mail";
import { passwordResetLink, passwordResetText, PASSWORD_RESET_SUBJECT, pathAfterPasswordReset } from "@/lib/password-reset";
import {
  clinicInviteResendSchema,
  clinicInviteSchema,
  newPasswordSchema,
  passwordResetRequestSchema,
  signInSchema,
  staffInviteSchema,
} from "@/lib/schemas/auth";
import {
  acceptClinicInviteMembership,
  acceptStaffInviteMembership,
  createConfirmedUser,
  createRecoveryToken,
  deleteAuthUser,
  findClinicInviteUser,
  findStaffInviteUser,
  readClinicInvite,
  readStaffInvite,
  recordClinicInviteFailure,
  recordStaffInviteFailure,
  revertClinicInviteResend,
  revertStaffInviteResend,
  setUserPassword,
  storeClinicInviteResend,
  storeStaffInviteResend,
  type ClinicInviteResendStored,
  type StaffInviteResendStored,
} from "@/lib/supabase/admin";
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
const INVITE_UNAVAILABLE = "Pozivnica trenutno ne može da se otvori. Pokušajte ponovo.";
const WRONG_CODE = "Pogrešan kod.";
const EMAIL_TAKEN = "Ovaj mejl već ima nalog.";
const OPENED = "Nalog je otvoren. Prijavite se.";
const RESEND_LIMIT = "Kod može da se pošalje najviše tri puta na sat.";

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

export async function acceptClinicInvite(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = clinicInviteSchema.safeParse({
    token: formData.get("token"),
    clinicName: formData.get("clinicName"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    code: formData.get("code"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const tokenInvalid = parsed.error.issues.some((issue) => issue.path[0] === "token");
    return fail(tokenInvalid ? LINK_INVALID : "Proverite unete podatke.", fieldErrorsFrom(parsed.error));
  }

  const tokenHash = hashInviteToken(parsed.data.token, process.env.TOKEN_PEPPER);
  if (!tokenHash) {
    return fail(INVITE_UNAVAILABLE);
  }

  let createdUserId: string | null = null;
  let accepted = false;
  let destination: string | null = null;
  try {
    const invite = await readClinicInvite(tokenHash);
    if (invite.status === "failed") {
      return fail(INVITE_UNAVAILABLE);
    }
    if (invite.status !== "ready") {
      return fail(LINK_INVALID);
    }

    const codeMatches = await verifyInviteCode(invite.codeHash, parsed.data.code);
    if (!codeMatches) {
      const failure = await recordClinicInviteFailure(tokenHash);
      if (failure.status === "wrong") {
        return fail(WRONG_CODE, { code: [WRONG_CODE] });
      }
      if (failure.status === "invalid") {
        return fail(LINK_INVALID);
      }
      return fail(INVITE_UNAVAILABLE);
    }

    const email = invite.email.trim().toLowerCase();
    const created = await createConfirmedUser(email, parsed.data.password);
    if (created.status === "weak_password") {
      return fail(OTHER_PASSWORD, { password: [OTHER_PASSWORD] });
    }
    if (created.status === "rate_limit") {
      return fail(RATE_LIMIT);
    }
    if (created.status !== "ok" && created.status !== "exists") {
      return fail(INVITE_UNAVAILABLE);
    }

    // A patient, a platform account, or an account left behind by a failed cleanup may
    // already hold this mailbox. One auth user carries both roles, so that account
    // becomes the owner instead of a second row.
    let userId: string;
    if (created.status === "ok") {
      userId = created.userId;
      createdUserId = created.userId;
    } else {
      const existing = await findClinicInviteUser(tokenHash);
      if (existing.status === "missing") {
        return fail(LINK_INVALID);
      }
      if (existing.status !== "ok") {
        return fail(INVITE_UNAVAILABLE);
      }
      userId = existing.userId;
    }

    const opened = await acceptClinicInviteMembership({
      tokenHash,
      codeHash: invite.codeHash,
      userId,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      clinicName: parsed.data.clinicName,
    });
    if (opened.status !== "ok") {
      if (createdUserId && opened.status !== "already_member") {
        await deleteAuthUser(createdUserId);
        createdUserId = null;
      }
      if (opened.status === "invalid") {
        return fail(LINK_INVALID);
      }
      if (opened.status === "already_member") {
        return fail(EMAIL_TAKEN);
      }
      return fail(INVITE_UNAVAILABLE);
    }
    accepted = true;

    // The clinic is open, so the form password may now replace the old one.
    if (!createdUserId) {
      const stored = await setUserPassword(userId, parsed.data.password);
      if (stored.status !== "ok") {
        return fail(OPENED);
      }
    }

    const supabase = await createSupabaseServerClient({ remember: false });
    const signedIn = await supabase.auth.signInWithPassword({ email, password: parsed.data.password });
    if (signedIn.error) {
      console.error("Invite sign-in rejected:", signedIn.error.code ?? signedIn.error.status ?? "unknown");
      return fail(OPENED);
    }

    const kind = await getSessionKind(supabase);
    const home = homePathFor(kind);
    const store = await cookies();
    if (!home) {
      await supabase.auth.signOut({ scope: "local" });
      store.set(SESSION_GATE_COOKIE, "", sessionCookieOptions({ maxAge: 0 }, false));
      return fail(OPENED);
    }
    store.set(REMEMBER_COOKIE, "0", sessionCookieOptions({}, false));
    store.set(SESSION_GATE_COOKIE, kind, sessionCookieOptions({}, false));
    destination = home;
  } catch (error) {
    console.error("Clinic invite failed:", error instanceof Error ? error.name : "unknown error");
    if (createdUserId && !accepted) {
      await deleteAuthUser(createdUserId);
    }
    return fail(accepted ? OPENED : INVITE_UNAVAILABLE);
  }

  if (!destination) {
    return fail(INVITE_UNAVAILABLE);
  }
  redirect(destination);
}

export async function resendClinicInvite(
  _previous: ActionResult<{ sent: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ sent: true }>> {
  const parsed = clinicInviteResendSchema.safeParse({ token: formData.get("token") });
  if (!parsed.success) {
    return fail(LINK_INVALID);
  }

  const tokenHash = hashInviteToken(parsed.data.token, process.env.TOKEN_PEPPER);
  if (!tokenHash) {
    return fail(RESET_UNAVAILABLE);
  }

  let stored: Extract<ClinicInviteResendStored, { status: "ok" }> | null = null;
  let codeHash = "";
  try {
    const invite = await readClinicInvite(tokenHash);
    if (invite.status === "invalid") {
      return fail(LINK_INVALID);
    }
    if (invite.status !== "ready") {
      return fail(RESET_UNAVAILABLE);
    }

    const code = randomInviteCode();
    codeHash = await hashInviteCode(code);
    const saved = await storeClinicInviteResend(tokenHash, codeHash);
    if (saved.status === "rate_limit") {
      return fail(RESEND_LIMIT);
    }
    if (saved.status === "invalid") {
      return fail(LINK_INVALID);
    }
    if (saved.status !== "ok") {
      return fail(RESET_UNAVAILABLE);
    }
    stored = saved;

    const link = clinicInviteLink(parsed.data.token, process.env.STAFF_URL, await requestOrigin());
    if (!link) {
      await undoResend(stored, tokenHash, codeHash);
      return fail(RESET_UNAVAILABLE);
    }

    await sendMail({
      to: stored.email,
      subject: CLINIC_INVITE_SUBJECT,
      text: clinicInviteText(link, code),
    });
  } catch (error) {
    if (stored) {
      await undoResend(stored, tokenHash, codeHash);
    }
    if (error instanceof MailError && error.code === "rate_limit_exceeded") {
      return fail(RATE_LIMIT);
    }
    console.error("Clinic invite mail failed:", error instanceof Error ? error.name : "unknown error");
    return fail(RESET_UNAVAILABLE);
  }

  return ok({ sent: true });
}

export async function acceptStaffInvite(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = staffInviteSchema.safeParse({
    token: formData.get("token"),
    code: formData.get("code"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const tokenInvalid = parsed.error.issues.some((issue) => issue.path[0] === "token");
    return fail(tokenInvalid ? LINK_INVALID : "Proverite unete podatke.", fieldErrorsFrom(parsed.error));
  }

  const tokenHash = hashInviteToken(parsed.data.token, process.env.TOKEN_PEPPER);
  if (!tokenHash) {
    return fail(INVITE_UNAVAILABLE);
  }

  let createdUserId: string | null = null;
  let accepted = false;
  let destination: string | null = null;
  try {
    const invite = await readStaffInvite(tokenHash);
    if (invite.status === "failed") {
      return fail(INVITE_UNAVAILABLE);
    }
    if (invite.status !== "ready") {
      return fail(LINK_INVALID);
    }

    const codeMatches = await verifyInviteCode(invite.codeHash, parsed.data.code);
    if (!codeMatches) {
      const failure = await recordStaffInviteFailure(tokenHash);
      if (failure.status === "wrong") {
        return fail(WRONG_CODE, { code: [WRONG_CODE] });
      }
      if (failure.status === "invalid") {
        return fail(LINK_INVALID);
      }
      return fail(INVITE_UNAVAILABLE);
    }

    const email = invite.email.trim().toLowerCase();
    const created = await createConfirmedUser(email, parsed.data.password);
    if (created.status === "weak_password") {
      return fail(OTHER_PASSWORD, { password: [OTHER_PASSWORD] });
    }
    if (created.status === "rate_limit") {
      return fail(RATE_LIMIT);
    }
    if (created.status !== "ok" && created.status !== "exists") {
      return fail(INVITE_UNAVAILABLE);
    }

    // A patient account may already hold this mailbox. One auth user carries both,
    // so that account joins the clinic instead of a second row.
    let userId: string;
    if (created.status === "ok") {
      userId = created.userId;
      createdUserId = created.userId;
    } else {
      const existing = await findStaffInviteUser(tokenHash);
      if (existing.status === "missing") {
        return fail(LINK_INVALID);
      }
      if (existing.status !== "ok") {
        return fail(INVITE_UNAVAILABLE);
      }
      userId = existing.userId;
    }

    const opened = await acceptStaffInviteMembership({
      tokenHash,
      codeHash: invite.codeHash,
      userId,
    });
    if (opened.status !== "ok") {
      if (createdUserId && opened.status !== "already_member") {
        await deleteAuthUser(createdUserId);
        createdUserId = null;
      }
      if (opened.status === "invalid") {
        return fail(LINK_INVALID);
      }
      if (opened.status === "already_member") {
        return fail(EMAIL_TAKEN);
      }
      return fail(INVITE_UNAVAILABLE);
    }
    accepted = true;

    if (!createdUserId) {
      const stored = await setUserPassword(userId, parsed.data.password);
      if (stored.status !== "ok") {
        return fail(OPENED);
      }
    }

    const supabase = await createSupabaseServerClient({ remember: false });
    const signedIn = await supabase.auth.signInWithPassword({ email, password: parsed.data.password });
    if (signedIn.error) {
      console.error("Invite sign-in rejected:", signedIn.error.code ?? signedIn.error.status ?? "unknown");
      return fail(OPENED);
    }

    const kind = await getSessionKind(supabase);
    const home = homePathFor(kind);
    const store = await cookies();
    if (!home) {
      await supabase.auth.signOut({ scope: "local" });
      store.set(SESSION_GATE_COOKIE, "", sessionCookieOptions({ maxAge: 0 }, false));
      return fail(OPENED);
    }
    store.set(REMEMBER_COOKIE, "0", sessionCookieOptions({}, false));
    store.set(SESSION_GATE_COOKIE, kind, sessionCookieOptions({}, false));
    destination = home;
  } catch (error) {
    console.error("Staff invite failed:", error instanceof Error ? error.name : "unknown error");
    if (createdUserId && !accepted) {
      await deleteAuthUser(createdUserId);
    }
    return fail(accepted ? OPENED : INVITE_UNAVAILABLE);
  }

  if (!destination) {
    return fail(INVITE_UNAVAILABLE);
  }
  redirect(destination);
}

export async function resendStaffInvite(
  _previous: ActionResult<{ sent: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ sent: true }>> {
  const parsed = clinicInviteResendSchema.safeParse({ token: formData.get("token") });
  if (!parsed.success) {
    return fail(LINK_INVALID);
  }

  const tokenHash = hashInviteToken(parsed.data.token, process.env.TOKEN_PEPPER);
  if (!tokenHash) {
    return fail(RESET_UNAVAILABLE);
  }

  let stored: Extract<StaffInviteResendStored, { status: "ok" }> | null = null;
  let codeHash = "";
  try {
    const invite = await readStaffInvite(tokenHash);
    if (invite.status === "invalid") {
      return fail(LINK_INVALID);
    }
    if (invite.status !== "ready") {
      return fail(RESET_UNAVAILABLE);
    }

    const code = randomInviteCode();
    codeHash = await hashInviteCode(code);
    const saved = await storeStaffInviteResend(tokenHash, codeHash);
    if (saved.status === "rate_limit") {
      return fail(RESEND_LIMIT);
    }
    if (saved.status === "invalid") {
      return fail(LINK_INVALID);
    }
    if (saved.status !== "ok") {
      return fail(RESET_UNAVAILABLE);
    }
    stored = saved;

    const link = clinicInviteLink(parsed.data.token, process.env.STAFF_URL, await requestOrigin());
    if (!link) {
      await undoStaffResend(stored, tokenHash, codeHash);
      return fail(RESET_UNAVAILABLE);
    }

    await sendMail({
      to: stored.email,
      subject: staffInviteSubject(stored.clinicName),
      text: staffInviteText({
        inviterName: stored.inviterName,
        roleLabel: staffInviteRoleLabel(stored.role),
        link,
        code,
      }),
    });
  } catch (error) {
    if (stored) {
      await undoStaffResend(stored, tokenHash, codeHash);
    }
    if (error instanceof MailError && error.code === "rate_limit_exceeded") {
      return fail(RATE_LIMIT);
    }
    console.error("Staff invite mail failed:", error instanceof Error ? error.name : "unknown error");
    return fail(RESET_UNAVAILABLE);
  }

  return ok({ sent: true });
}

async function undoStaffResend(
  stored: Extract<StaffInviteResendStored, { status: "ok" }>,
  tokenHash: string,
  newCodeHash: string,
): Promise<void> {
  const reverted = await revertStaffInviteResend({
    tokenHash,
    previousCodeHash: stored.previousCodeHash,
    newCodeHash,
    previousSendCount: stored.previousSendCount,
    previousLastSentAt: stored.previousLastSentAt,
  });
  if (!reverted) {
    console.error("Staff invite resend revert failed");
  }
}

async function undoResend(
  stored: Extract<ClinicInviteResendStored, { status: "ok" }>,
  tokenHash: string,
  newCodeHash: string,
): Promise<void> {
  const reverted = await revertClinicInviteResend({
    tokenHash,
    previousCodeHash: stored.previousCodeHash,
    newCodeHash,
    previousSendCount: stored.previousSendCount,
    previousLastSentAt: stored.previousLastSentAt,
  });
  if (!reverted) {
    console.error("Clinic invite resend revert failed");
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
