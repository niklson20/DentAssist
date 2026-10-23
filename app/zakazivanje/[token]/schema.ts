import { z } from "zod";

import { formatBelgrade } from "@/lib/calendar-dates";

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
