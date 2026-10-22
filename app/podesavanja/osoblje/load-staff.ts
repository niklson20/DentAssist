import type { MemberRole } from "@/lib/labels";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { isStaffInviteRole } from "./schema";

export type StaffMemberView = {
  id: string;
  userId: string;
  role: MemberRole;
  firstName: string;
  lastName: string;
  seesPatients: boolean;
  listedOnline: boolean;
  unavailable: boolean;
};

export type PendingStaffInviteView = {
  id: string;
  email: string;
  role: "dentist" | "reception";
  firstName: string;
  lastName: string;
  expiresAt: string;
  attemptCount: number;
};

export type StaffPageData =
  | {
      status: "ready";
      ownerMemberId: string;
      ownerPinSet: boolean;
      soleOwner: boolean;
      members: StaffMemberView[];
      pendingInvites: PendingStaffInviteView[];
    }
  | { status: "unavailable" };

export async function loadStaffPage(clinicId: string, userId: string): Promise<StaffPageData> {
  try {
    const supabase = await createSupabaseServerClient();
    const [membersResult, invitesResult, pinResult] = await Promise.all([
      supabase
        .from("clinic_members")
        .select(
          "id, user_id, role, first_name, last_name, sees_patients, listed_online, unavailable",
        )
        .eq("clinic_id", clinicId)
        .order("first_name")
        .order("last_name"),
      supabase
        .from("staff_invites")
        .select("id, email, role, first_name, last_name, expires_at, used_at, attempt_count")
        .eq("clinic_id", clinicId)
        .is("used_at", null)
        .order("created_at", { ascending: false }),
      supabase.rpc("own_pin_is_set"),
    ]);

    if (membersResult.error || invitesResult.error || pinResult.error) {
      console.error(
        "load_staff_page rejected:",
        membersResult.error?.code ?? invitesResult.error?.code ?? pinResult.error?.code ?? "unknown",
      );
      return { status: "unavailable" };
    }

    const members = (membersResult.data ?? [])
      .map(parseMemberRow)
      .filter((row): row is StaffMemberView => row !== null);

    const owner = members.find((member) => member.userId === userId);
    if (!owner) {
      return { status: "unavailable" };
    }

    const ownerCount = members.filter((member) => member.role === "owner").length;
    const now = Date.now();
    const pendingInvites = (invitesResult.data ?? [])
      .map(parseInviteRow)
      .filter((row): row is PendingStaffInviteView => row !== null)
      .filter((invite) => invite.attemptCount < 5 && Date.parse(invite.expiresAt) > now);

    return {
      status: "ready",
      ownerMemberId: owner.id,
      soleOwner: ownerCount === 1,
      ownerPinSet: pinResult.data === true,
      members,
      pendingInvites,
    };
  } catch (error) {
    console.error("load_staff_page failed:", error instanceof Error ? error.name : "unknown error");
    return { status: "unavailable" };
  }
}

function parseMemberRow(row: Record<string, unknown>): StaffMemberView | null {
  const role = row.role;
  if (role !== "owner" && role !== "dentist" && role !== "reception") {
    return null;
  }
  if (
    typeof row.id !== "string" ||
    typeof row.user_id !== "string" ||
    typeof row.first_name !== "string" ||
    typeof row.last_name !== "string" ||
    typeof row.sees_patients !== "boolean" ||
    typeof row.listed_online !== "boolean" ||
    typeof row.unavailable !== "boolean"
  ) {
    return null;
  }
  return {
    id: row.id,
    userId: row.user_id,
    role,
    firstName: row.first_name,
    lastName: row.last_name,
    seesPatients: row.sees_patients,
    listedOnline: row.listed_online,
    unavailable: row.unavailable,
  };
}

function parseInviteRow(row: Record<string, unknown>): PendingStaffInviteView | null {
  const role = row.role;
  if (!isStaffInviteRole(String(role))) {
    return null;
  }
  if (
    typeof row.id !== "string" ||
    typeof row.email !== "string" ||
    typeof row.first_name !== "string" ||
    typeof row.last_name !== "string" ||
    typeof row.expires_at !== "string" ||
    typeof row.attempt_count !== "number"
  ) {
    return null;
  }
  return {
    id: row.id,
    email: row.email,
    role,
    firstName: row.first_name,
    lastName: row.last_name,
    expiresAt: row.expires_at,
    attemptCount: row.attempt_count,
  };
}
