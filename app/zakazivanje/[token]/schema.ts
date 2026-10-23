import { z } from "zod";

import { addCalendarDays, formatBelgrade, isIsoDate } from "@/lib/calendar-dates";

export const LINK_INVALID = "Ovaj link više ne važi.";
export const LINK_INVALID_PHONE =
  "Ovaj link više ne važi. Ako termin još nije prošao, zovite ordinaciju:";
export const PICK_OFFER = "Izaberite jedan od ponuđenih termina.";
export const OFFER_UNAVAILABLE = "Ponuda trenutno ne može da se sačuva. Pokušajte ponovo.";
export const TERMIN_CONFIRMED = "Termin je potvrđen.";
export const OFFER_DECLINED = "Ponuda je odbijena.";
export const NO_OFFERS = "Nema ponuđenih termina.";

const OFFER_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const offerTokenSchema = z
  .string({ error: LINK_INVALID })
  .trim()
  .min(1, LINK_INVALID)
  .max(200, LINK_INVALID)
  .regex(/^[A-Za-z0-9_-]+$/, LINK_INVALID);

export const chooseOfferSchema = z.object({
  token: offerTokenSchema,
  offerId: z.string({ error: PICK_OFFER }).trim().regex(OFFER_ID, PICK_OFFER),
});

export const declineOffersSchema = z.object({
  token: offerTokenSchema,
});

export type OfferSlot = {
  id: string;
  startsAt: string;
  endsAt: string;
  dentistFirstName: string;
  dentistLastName: string;
};

export function invalidOfferLinkText(phone: string | null): string {
  const safe = phone?.replace(/[\r\n]+/g, " ").trim() ?? "";
  if (!safe) {
    return LINK_INVALID;
  }
  return `${LINK_INVALID_PHONE} ${safe}.`;
}

export function formatOfferWhen(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "";
  }
  const day = formatBelgrade(start, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const from = formatBelgrade(start, { hour: "2-digit", minute: "2-digit" });
  const to = formatBelgrade(end, { hour: "2-digit", minute: "2-digit" });
  return `${day}, ${from}–${to}`;
}

export function formatOfferDentist(slot: Pick<OfferSlot, "dentistFirstName" | "dentistLastName">): string {
  return `${slot.dentistFirstName} ${slot.dentistLastName}`.trim();
}

export const PICK_SLOT = "Izaberite slobodan termin.";
export const PICK_DAY = "Izaberite dan.";
export const MOVE_UNAVAILABLE = "Termin trenutno ne može da se sačuva. Pokušajte ponovo.";
export const TERMIN_MOVED = "Termin je pomeren.";
export const TERMIN_CANCELLED = "Termin je otkazan.";
export const ALREADY_MOVED = "Termin možete da pomerite samo jednom.";
export const CALL_CLINIC = "Pomeranje i otkaz više nisu mogući. Zovite ordinaciju:";
export const NO_SLOTS = "Nema slobodnih termina ovog dana.";

const DAY_STRIP_LIMIT = 366;

export const rescheduleSchema = z.object({
  token: offerTokenSchema,
  startsAt: z.string({ error: PICK_SLOT }).trim().min(1, PICK_SLOT).max(40, PICK_SLOT),
});

export const cancelManageSchema = z.object({
  token: offerTokenSchema,
});

export const manageSlotsSchema = z.object({
  token: offerTokenSchema,
  day: z
    .string({ error: PICK_DAY })
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, PICK_DAY),
});

export type ManageSlot = {
  startsAt: string;
  endsAt: string;
};

export function tooLateText(phone: string | null): string {
  const safe = phone?.replace(/[\r\n]+/g, " ").trim() ?? "";
  if (!safe) {
    return LINK_INVALID;
  }
  return `${CALL_CLINIC} ${safe}.`;
}

export function formatManageTime(startsAt: string): string {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) {
    return "";
  }
  return formatBelgrade(start, { hour: "2-digit", minute: "2-digit" });
}

export function sameInstant(left: string, right: string): boolean {
  const first = new Date(left).getTime();
  const second = new Date(right).getTime();
  return !Number.isNaN(first) && first === second;
}

export function findManageSlot(slots: readonly ManageSlot[], startsAt: string): ManageSlot | null {
  return slots.find((slot) => sameInstant(slot.startsAt, startsAt)) ?? null;
}

export function manageDayOptions(todayIso: string, maxAheadDays: number): string[] {
  if (!isIsoDate(todayIso) || !Number.isInteger(maxAheadDays) || maxAheadDays < 0) {
    return [];
  }
  const last = Math.min(maxAheadDays, DAY_STRIP_LIMIT);
  const days: string[] = [];
  for (let offset = 0; offset <= last; offset += 1) {
    days.push(addCalendarDays(todayIso, offset));
  }
  return days;
}
