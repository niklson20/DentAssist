import { isInviteCodeHash } from "@/lib/clinic-invite";
import type { ReceptionDesk, ReceptionMember } from "@/lib/reception-pin-ui";

/** HttpOnly cookie that holds the reception-computer secret. */
export const CLINIC_DEVICE_COOKIE = "clinic_device";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type ReceptionDeviceList =
  | ({ status: "ok" } & ReceptionDesk)
  | { status: "invalid" }
  | { status: "failed" };

export type ReceptionPinRecord =
  | { status: "ready"; pinHash: string; email: string; userId: string; attemptCount: number }
  | { status: "password"; email: string; userId: string }
  | { status: "invalid" }
  | { status: "failed" };

export type ReceptionPinFailure =
  | { status: "wrong"; attemptCount: number }
  | { status: "password"; attemptCount: number }
  | { status: "invalid" }
  | { status: "failed" };

export type ReceptionPinCleared = { status: "ok" } | { status: "invalid" } | { status: "failed" };

export function parseReceptionDeviceList(record: Record<string, unknown>): ReceptionDeviceList {
  if (record.status === "invalid") {
    return { status: "invalid" };
  }
  if (record.status !== "ok" || !Array.isArray(record.members)) {
    return { status: "failed" };
  }
  const clinicName = oneLine(record.clinic_name);
  if (!clinicName) {
    return { status: "failed" };
  }
  const members: ReceptionMember[] = [];
  for (const item of record.members) {
    const member = parseMember(item);
    if (!member) {
      return { status: "failed" };
    }
    members.push(member);
  }
  return { status: "ok", clinicName, members };
}

export function parseReceptionPin(record: Record<string, unknown>): ReceptionPinRecord {
  if (record.status === "invalid") {
    return { status: "invalid" };
  }
  const email = receptionEmail(record.email);
  const userId = receptionUserId(record.user_id);
  if (!email || !userId) {
    return { status: "failed" };
  }
  if (record.status === "password") {
    return { status: "password", email, userId };
  }
  if (record.status !== "ready") {
    return { status: "failed" };
  }
  const attemptCount = receptionAttempt(record.attempt_count);
  const pinHash = typeof record.pin_hash === "string" ? record.pin_hash : "";
  if (attemptCount === null || attemptCount >= 5 || !isInviteCodeHash(pinHash)) {
    return { status: "failed" };
  }
  return { status: "ready", email, userId, pinHash, attemptCount };
}

export function parseReceptionPinFailure(record: Record<string, unknown>): ReceptionPinFailure {
  if (record.status === "invalid") {
    return { status: "invalid" };
  }
  const attemptCount = receptionAttempt(record.attempt_count);
  if (attemptCount === null) {
    return { status: "failed" };
  }
  if (record.status === "password" && attemptCount >= 5) {
    return { status: "password", attemptCount };
  }
  if (record.status === "wrong" && attemptCount > 0 && attemptCount < 5) {
    return { status: "wrong", attemptCount };
  }
  return { status: "failed" };
}

export function parseReceptionPinCleared(record: Record<string, unknown>): ReceptionPinCleared {
  if (record.status === "ok" || record.status === "invalid") {
    return { status: record.status };
  }
  return { status: "failed" };
}

function parseMember(value: unknown): ReceptionMember | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  const id = receptionUserId(row.id);
  const firstName = oneLine(row.first_name);
  const lastName = oneLine(row.last_name);
  if (!id || !firstName || !lastName) {
    return null;
  }
  return { id, firstName, lastName };
}

function receptionUserId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const id = value.trim().toLowerCase();
  return UUID.test(id) ? id : null;
}

function receptionEmail(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const email = value.trim().toLowerCase();
  if (!email || email.length > 320 || /\s/.test(email) || !email.includes("@")) {
    return null;
  }
  return email;
}

function receptionAttempt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 5) {
    return null;
  }
  return value;
}

function oneLine(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}
