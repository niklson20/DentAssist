import { timingSafeEqual } from "node:crypto";

import type { StaffRole } from "@/lib/auth";
import { isInviteCodeHash } from "@/lib/clinic-invite";

/** HttpOnly cookie. The value is the auth session id, so a new login closes settings. */
export const SETTINGS_PIN_COOKIE = "dent_settings_pin";

const SESSION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type OwnerSettingsPin =
  | { status: "ready"; pinHash: string }
  | { status: "unset" }
  | { status: "invalid" }
  | { status: "failed" };

export function settingsPinRequired(input: {
  role: StaffRole;
  memberCount: number;
  liveInviteCount: number;
}): boolean {
  if (input.role !== "owner") {
    return false;
  }
  if (!Number.isInteger(input.memberCount) || input.memberCount < 1) {
    return true;
  }
  if (!Number.isInteger(input.liveInviteCount) || input.liveInviteCount < 0) {
    return true;
  }
  return input.memberCount > 1 || input.liveInviteCount > 0;
}

/** A staff invite that can still be accepted. Expired and locked invites do not count. */
export function isLiveStaffInvite(
  invite: { usedAt: string | null; attemptCount: number; expiresAt: string },
  now: number,
): boolean {
  if (invite.usedAt !== null) {
    return false;
  }
  if (!Number.isInteger(invite.attemptCount) || invite.attemptCount < 0 || invite.attemptCount >= 5) {
    return false;
  }
  const expires = Date.parse(invite.expiresAt);
  return Number.isFinite(expires) && expires > now;
}

export function sessionIdFromClaims(claims: unknown): string | null {
  if (!claims || typeof claims !== "object" || Array.isArray(claims)) {
    return null;
  }
  const value = (claims as { session_id?: unknown }).session_id;
  if (typeof value !== "string") {
    return null;
  }
  const id = value.trim().toLowerCase();
  return SESSION_ID.test(id) ? id : null;
}

export function settingsPinCookieMatches(cookieValue: string | undefined, sessionId: string | null): boolean {
  if (!cookieValue || !sessionId) {
    return false;
  }
  const cookie = cookieValue.trim().toLowerCase();
  const session = sessionId.trim().toLowerCase();
  if (!SESSION_ID.test(cookie) || !SESSION_ID.test(session)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(cookie), Buffer.from(session));
}

export function parseOwnerSettingsPin(value: unknown): OwnerSettingsPin {
  const record = asRecord(value);
  if (!record) {
    return { status: "failed" };
  }
  if (record.status === "invalid") {
    return { status: "invalid" };
  }
  if (record.status === "unset") {
    return { status: "unset" };
  }
  if (record.status === "ready" && typeof record.pin_hash === "string" && isInviteCodeHash(record.pin_hash)) {
    return { status: "ready", pinHash: record.pin_hash };
  }
  return { status: "failed" };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value) as unknown);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}
