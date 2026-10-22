import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { normalizeClinicSlug } from "@/lib/password-reset";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const DENTIST_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLOT_START =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

export type StaffRole = "owner" | "dentist" | "reception";

export type MemberSession = {
  userId: string;
  clinicId: string;
  role: StaffRole;
};

export type PlatformAdminSession = {
  userId: string;
};

/** `unknown` means a technical failure, not a missing account. */
export type SessionKind = "anonymous" | "staff" | "platform" | "patient" | "unknown";

export type StaffHome = "/danas" | "/platforma";

export async function requireMember(): Promise<MemberSession> {
  const member = await findMember();
  if (!member) {
    redirect("/prijava");
  }
  return member;
}

export async function requireOwner(): Promise<MemberSession> {
  const member = await requireMember();
  if (member.role !== "owner") {
    redirect("/prijava");
  }
  return member;
}

export async function requirePlatformAdmin(): Promise<PlatformAdminSession> {
  const admin = await findPlatformAdmin();
  if (!admin) {
    redirect("/prijava");
  }
  return admin;
}

/** Staff wins when an account is both; platform accounts are created by hand and are rarely staff. */
export async function getSessionKind(client?: SupabaseClient): Promise<SessionKind> {
  try {
    const supabase = client ?? (await createSupabaseServerClient());
    const userId = await getUserId(supabase);
    if (!userId) {
      return "anonymous";
    }
    if (await lookupMember(supabase, userId)) {
      return "staff";
    }
    return (await lookupPlatformAdmin(supabase)) ? "platform" : "patient";
  } catch (error) {
    logAuthFailure(error);
    return "unknown";
  }
}

export function homePathFor(kind: SessionKind): StaffHome | null {
  if (kind === "staff") {
    return "/danas";
  }
  if (kind === "platform") {
    return "/platforma";
  }
  return null;
}

async function findMember(): Promise<MemberSession | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await getUserId(supabase);
    return userId ? await lookupMember(supabase, userId) : null;
  } catch (error) {
    logAuthFailure(error);
    return null;
  }
}

async function findPlatformAdmin(): Promise<PlatformAdminSession | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await getUserId(supabase);
    if (!userId || !(await lookupPlatformAdmin(supabase))) {
      return null;
    }
    return { userId };
  } catch (error) {
    logAuthFailure(error);
    return null;
  }
}

async function getUserId(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    // A missing or expired session is an ordinary anonymous visit.
    return null;
  }
  return data.user.id;
}

// Receptionists cannot SELECT clinic_members, so roles come from the DB.md helper functions.
async function lookupMember(supabase: SupabaseClient, userId: string): Promise<MemberSession | null> {
  const [clinic, role] = await Promise.all([
    supabase.rpc("current_clinic_id"),
    supabase.rpc("current_member_role"),
  ]);
  if (clinic.error) {
    throw new Error(`current_clinic_id failed: ${clinic.error.message}`);
  }
  if (role.error) {
    throw new Error(`current_member_role failed: ${role.error.message}`);
  }
  if (typeof clinic.data !== "string" || !isStaffRole(role.data)) {
    return null;
  }
  return { userId, clinicId: clinic.data, role: role.data };
}

async function lookupPlatformAdmin(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error) {
    throw new Error(`is_platform_admin failed: ${error.message}`);
  }
  return data === true;
}

function isStaffRole(value: unknown): value is StaffRole {
  return value === "owner" || value === "dentist" || value === "reception";
}

function logAuthFailure(error: unknown) {
  console.error("Auth lookup failed:", error instanceof Error ? error.message : "unknown error");
}

export type PatientSession = {
  userId: string;
  accountId: string;
  email: string;
  emailConfirmedAt: string | null;
};

export type PatientAuthPage = "prijava" | "registracija";

export type PatientReturnQuery = {
  stomatolog?: string;
  pocetak?: string;
};

export type RequirePatientOptions = {
  /** Booking request. An unconfirmed email does not pass. */
  purpose?: "request";
  slug?: string;
  stomatolog?: string;
  pocetak?: string;
};

/** Keeps a dentist id and a slot start together. Anything else is dropped. */
export function readPatientReturnQuery(
  stomatolog: string | null | undefined,
  pocetak: string | null | undefined,
): PatientReturnQuery {
  const dentistId = stomatolog?.trim() ?? "";
  const startsAt = pocetak?.trim() ?? "";
  if (!DENTIST_ID.test(dentistId) || !SLOT_START.test(startsAt)) {
    return {};
  }
  return { stomatolog: dentistId, pocetak: startsAt };
}

/** Same clinic, or the saved dentist and start when both are still intact. */
export function patientReturnPath(
  slug: string | null | undefined,
  query: PatientReturnQuery = {},
): string {
  const safeSlug = normalizeClinicSlug(slug);
  if (!safeSlug) {
    return "/";
  }
  const saved = readPatientReturnQuery(query.stomatolog, query.pocetak);
  if (!saved.stomatolog || !saved.pocetak) {
    return `/ordinacije/${safeSlug}`;
  }
  const params = new URLSearchParams({
    stomatolog: saved.stomatolog,
    pocetak: saved.pocetak,
  });
  return `/ordinacije/${safeSlug}/zakazivanje?${params.toString()}`;
}

export function patientAuthPath(
  slug: string | null | undefined,
  page: PatientAuthPage,
  query: PatientReturnQuery = {},
): string {
  const safeSlug = normalizeClinicSlug(slug);
  if (!safeSlug) {
    return "/";
  }
  const saved = readPatientReturnQuery(query.stomatolog, query.pocetak);
  if (!saved.stomatolog || !saved.pocetak) {
    return `/ordinacije/${safeSlug}/${page}`;
  }
  const params = new URLSearchParams({
    stomatolog: saved.stomatolog,
    pocetak: saved.pocetak,
  });
  return `/ordinacije/${safeSlug}/${page}?${params.toString()}`;
}

/**
 * Requires a row in patient_accounts.
 * A request also requires a confirmed email. An unconfirmed account does not pass.
 */
export async function requirePatient(options: RequirePatientOptions = {}): Promise<PatientSession> {
  const account = await findPatientAccount();
  const query = { stomatolog: options.stomatolog, pocetak: options.pocetak };
  if (!account) {
    redirect(patientAuthPath(options.slug, "prijava", query));
  }
  if (options.purpose === "request" && !account.emailConfirmedAt) {
    redirect(patientAuthPath(options.slug, "registracija", query));
  }
  return account;
}

async function findPatientAccount(): Promise<PatientSession | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await getUserId(supabase);
    return userId ? await lookupPatientAccount(supabase, userId) : null;
  } catch (error) {
    logAuthFailure(error);
    return null;
  }
}

async function lookupPatientAccount(
  supabase: SupabaseClient,
  userId: string,
): Promise<PatientSession | null> {
  const { data, error } = await supabase
    .from("patient_accounts")
    .select("id, email, email_confirmed_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(`patient_accounts failed: ${error.message}`);
  }
  if (!data || typeof data.id !== "string" || typeof data.email !== "string") {
    return null;
  }
  const confirmedAt = data.email_confirmed_at;
  return {
    userId,
    accountId: data.id,
    email: data.email,
    emailConfirmedAt: typeof confirmedAt === "string" && confirmedAt.length > 0 ? confirmedAt : null,
  };
}
