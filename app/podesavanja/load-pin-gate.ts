import { cookies } from "next/headers";

import type { MemberSession } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  isLiveStaffInvite,
  sessionIdFromClaims,
  SETTINGS_PIN_COOKIE,
  settingsPinCookieMatches,
  settingsPinRequired,
} from "./pin-gate";

export type SettingsPinGate =
  | { status: "open" }
  | { status: "locked"; pinSet: boolean }
  | { status: "unavailable" };

export async function loadSettingsPinGate(member: MemberSession): Promise<SettingsPinGate> {
  if (member.role !== "owner") {
    return { status: "open" };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const store = await cookies();
    const [membersResult, invitesResult, pinResult, claimsResult] = await Promise.all([
      supabase.from("clinic_members").select("id").eq("clinic_id", member.clinicId),
      supabase
        .from("staff_invites")
        .select("used_at, attempt_count, expires_at")
        .eq("clinic_id", member.clinicId)
        .is("used_at", null),
      supabase.rpc("own_pin_is_set"),
      supabase.auth.getClaims(),
    ]);

    if (membersResult.error || invitesResult.error) {
      console.error(
        "settings_pin_gate rejected:",
        membersResult.error?.code ?? invitesResult.error?.code ?? "unknown",
      );
      return { status: "unavailable" };
    }

    const memberCount = countMembers(membersResult.data);
    const liveInviteCount = countLiveInvites(invitesResult.data, Date.now());
    if (memberCount === null || liveInviteCount === null) {
      console.error("settings_pin_gate rejected: shape");
      return { status: "unavailable" };
    }

    if (!settingsPinRequired({ role: member.role, memberCount, liveInviteCount })) {
      return { status: "open" };
    }

    const sessionId = claimsResult.error ? null : sessionIdFromClaims(claimsResult.data?.claims);
    const cookie = store.get(SETTINGS_PIN_COOKIE)?.value;
    if (settingsPinCookieMatches(cookie, sessionId)) {
      return { status: "open" };
    }

    if (pinResult.error || (pinResult.data !== true && pinResult.data !== false)) {
      console.error("settings_pin_gate rejected:", pinResult.error?.code ?? "pin");
      return { status: "unavailable" };
    }

    return { status: "locked", pinSet: pinResult.data === true };
  } catch (error) {
    console.error("settings_pin_gate failed:", error instanceof Error ? error.name : "unknown error");
    return { status: "unavailable" };
  }
}

function countMembers(rows: unknown): number | null {
  if (!Array.isArray(rows)) {
    return null;
  }
  for (const row of rows) {
    if (!row || typeof row !== "object" || typeof (row as { id?: unknown }).id !== "string") {
      return null;
    }
  }
  return rows.length;
}

function countLiveInvites(rows: unknown, now: number): number | null {
  if (!Array.isArray(rows)) {
    return null;
  }
  let count = 0;
  for (const row of rows) {
    const invite = parseInvite(row);
    if (!invite) {
      return null;
    }
    if (isLiveStaffInvite(invite, now)) {
      count += 1;
    }
  }
  return count;
}

function parseInvite(row: unknown): { usedAt: string | null; attemptCount: number; expiresAt: string } | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return null;
  }
  const record = row as Record<string, unknown>;
  if (record.used_at !== null && typeof record.used_at !== "string") {
    return null;
  }
  if (typeof record.attempt_count !== "number" || typeof record.expires_at !== "string") {
    return null;
  }
  return {
    usedAt: record.used_at,
    attemptCount: record.attempt_count,
    expiresAt: record.expires_at,
  };
}
