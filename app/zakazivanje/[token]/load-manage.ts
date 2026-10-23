import { hashInviteToken } from "@/lib/clinic-invite";
import { isIsoDate } from "@/lib/calendar-dates";
import { normalizeClinicSlug } from "@/lib/password-reset";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { sameInstant, type ManageSlot } from "./schema";

const SLOT_LIMIT = 96;

export type ManagePreview =
  | { status: "invalid"; phone: string | null }
  | { status: "signed_out"; slug: string }
  | { status: "unconfirmed"; slug: string }
  | { status: "mismatch"; slug: string; phone: string }
  | {
      status: "too_late";
      slug: string;
      clinicName: string;
      phone: string;
      startsAt: string;
      endsAt: string;
      dentistFirstName: string;
      dentistLastName: string;
    }
  | {
      status: "ready";
      slug: string;
      clinicName: string;
      phone: string;
      startsAt: string;
      endsAt: string;
      dentistFirstName: string;
      dentistLastName: string;
      canReschedule: boolean;
      today: string;
      maxAheadDays: number;
      day: string;
      slots: ManageSlot[];
    };

export async function loadManage(token: string, day?: string | null): Promise<ManagePreview> {
  const requestedDay = day && isIsoDate(day) ? day : null;
  const tokenHash = hashInviteToken(token, process.env.TOKEN_PEPPER);
  if (!tokenHash) {
    return { status: "invalid", phone: null };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("preview_booking_manage", {
      p_token_hash: tokenHash,
      p_day: requestedDay,
    });
    if (error) {
      console.error("preview_booking_manage rejected:", error.code ?? "rejected");
      return { status: "invalid", phone: null };
    }
    const preview = parseManagePreview(data);
    if (requestedDay && preview.status === "ready" && preview.day !== requestedDay) {
      return { ...preview, slots: [] };
    }
    return preview;
  } catch (error) {
    console.error("preview_booking_manage failed:", error instanceof Error ? error.name : "unknown");
    return { status: "invalid", phone: null };
  }
}

export function parseManagePreview(data: unknown): ManagePreview {
  const record = asRecord(data);
  if (!record) {
    return { status: "invalid", phone: null };
  }

  const slug = normalizeClinicSlug(typeof record.slug === "string" ? record.slug : undefined);
  const phone = oneLine(record.phone, 40);
  const clinicName = oneLine(record.clinic_name, 200);

  if (record.status === "signed_out" || record.status === "unconfirmed") {
    if (!slug) {
      return { status: "invalid", phone: null };
    }
    return { status: record.status, slug };
  }

  if (record.status === "mismatch") {
    if (!slug || !phone) {
      return { status: "invalid", phone };
    }
    return { status: "mismatch", slug, phone };
  }

  if (record.status === "invalid") {
    return { status: "invalid", phone };
  }

  const appointment = parseAppointment(record);
  if (!slug || !clinicName || !phone || !appointment) {
    return { status: "invalid", phone };
  }

  if (record.status === "too_late") {
    return {
      status: "too_late",
      slug,
      clinicName,
      phone,
      ...appointment,
    };
  }

  const today = typeof record.today === "string" ? record.today : "";
  const shownDay = typeof record.day === "string" ? record.day : "";
  const maxAheadDays = record.max_ahead_days;
  if (
    record.status !== "ready" ||
    !isIsoDate(today) ||
    !isIsoDate(shownDay) ||
    typeof maxAheadDays !== "number" ||
    !Number.isInteger(maxAheadDays) ||
    maxAheadDays < 0
  ) {
    return { status: "invalid", phone };
  }

  const canReschedule = record.can_reschedule === true;
  return {
    status: "ready",
    slug,
    clinicName,
    phone,
    ...appointment,
    canReschedule,
    today,
    maxAheadDays,
    day: shownDay,
    slots: canReschedule ? parseSlots(record.slots, appointment.startsAt) : [],
  };
}

function parseAppointment(record: Record<string, unknown>): {
  startsAt: string;
  endsAt: string;
  dentistFirstName: string;
  dentistLastName: string;
} | null {
  const startsAt = typeof record.starts_at === "string" ? record.starts_at : "";
  const endsAt = typeof record.ends_at === "string" ? record.ends_at : "";
  const dentistFirstName = oneLine(record.dentist_first_name, 100);
  const dentistLastName = oneLine(record.dentist_last_name, 100);
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (!dentistFirstName || !dentistLastName) {
    return null;
  }
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
    return null;
  }
  return { startsAt, endsAt, dentistFirstName, dentistLastName };
}

function parseSlots(data: unknown, currentStartsAt: string): ManageSlot[] {
  if (!Array.isArray(data)) {
    return [];
  }
  const slots: ManageSlot[] = [];
  for (const item of data) {
    const slot = parseSlot(item);
    if (!slot || sameInstant(slot.startsAt, currentStartsAt)) {
      continue;
    }
    if (slots.some((existing) => sameInstant(existing.startsAt, slot.startsAt))) {
      continue;
    }
    slots.push(slot);
    if (slots.length === SLOT_LIMIT) {
      break;
    }
  }
  return slots;
}

function parseSlot(data: unknown): ManageSlot | null {
  const record = asRecord(data);
  if (!record) {
    return null;
  }
  const startsAt = typeof record.starts_at === "string" ? record.starts_at : "";
  const endsAt = typeof record.ends_at === "string" ? record.ends_at : "";
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
    return null;
  }
  return { startsAt, endsAt };
}

function asRecord(data: unknown): Record<string, unknown> | null {
  if (typeof data === "string") {
    try {
      return asRecord(JSON.parse(data) as unknown);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }
  return data as Record<string, unknown>;
}

function oneLine(value: unknown, max: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const text = value.replace(/[\r\n]+/g, " ").trim();
  if (!text || text.length > max) {
    return null;
  }
  return text;
}
