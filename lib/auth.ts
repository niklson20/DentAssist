import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

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
