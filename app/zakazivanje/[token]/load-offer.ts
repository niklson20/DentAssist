import { hashInviteToken } from "@/lib/clinic-invite";
import { normalizeClinicSlug } from "@/lib/password-reset";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { OfferSlot } from "./schema";

const OFFER_LIMIT = 3;
const OFFER_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OfferPreview =
  | { status: "invalid"; phone: string | null }
  | { status: "signed_out"; slug: string }
  | { status: "unconfirmed"; slug: string }
  | { status: "mismatch"; slug: string; phone: string }
  | { status: "accepted"; slug: string; clinicName: string }
  | { status: "declined"; slug: string; clinicName: string }
  | { status: "ready"; slug: string; clinicName: string; phone: string; offers: OfferSlot[] };

export async function loadOffer(token: string): Promise<OfferPreview> {
  const tokenHash = hashInviteToken(token, process.env.TOKEN_PEPPER);
  if (!tokenHash) {
    return { status: "invalid", phone: null };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("preview_booking_offer", {
      p_token_hash: tokenHash,
    });
    if (error) {
      console.error("preview_booking_offer rejected:", error.code ?? "rejected");
      return { status: "invalid", phone: null };
    }
    return parseOfferPreview(data);
  } catch (error) {
    console.error("preview_booking_offer failed:", error instanceof Error ? error.name : "unknown");
    return { status: "invalid", phone: null };
  }
}

export function parseOfferPreview(data: unknown): OfferPreview {
  if (!data || typeof data !== "object") {
    return { status: "invalid", phone: null };
  }
  const record = data as Record<string, unknown>;
  const slug = normalizeClinicSlug(typeof record.slug === "string" ? record.slug : undefined);
  const phone = oneLine(record.phone, 40);
  const clinicName = oneLine(record.clinic_name, 120);

  if (record.status === "signed_out" || record.status === "unconfirmed") {
    if (!slug) {
      return { status: "invalid", phone: null };
    }
    return { status: record.status, slug };
  }

  if (record.status === "accepted" || record.status === "declined") {
    if (!slug || !clinicName) {
      return { status: "invalid", phone: null };
    }
    return { status: record.status, slug, clinicName };
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

  if (record.status !== "ready" || !slug || !clinicName || !phone) {
    return { status: "invalid", phone };
  }

  return {
    status: "ready",
    slug,
    clinicName,
    phone,
    offers: parseOffers(record.offers),
  };
}

function parseOffers(data: unknown): OfferSlot[] {
  if (!Array.isArray(data)) {
    return [];
  }
  const offers: OfferSlot[] = [];
  for (const item of data) {
    const slot = parseOffer(item);
    if (!slot || offers.some((offer) => offer.id === slot.id)) {
      continue;
    }
    offers.push(slot);
    if (offers.length === OFFER_LIMIT) {
      break;
    }
  }
  return offers;
}

function parseOffer(data: unknown): OfferSlot | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const record = data as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const startsAt = typeof record.starts_at === "string" ? record.starts_at : "";
  const endsAt = typeof record.ends_at === "string" ? record.ends_at : "";
  const dentistFirstName = oneLine(record.dentist_first_name, 80);
  const dentistLastName = oneLine(record.dentist_last_name, 80);
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (!OFFER_ID.test(id) || !dentistFirstName || !dentistLastName) {
    return null;
  }
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
    return null;
  }
  return { id, startsAt, endsAt, dentistFirstName, dentistLastName };
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
