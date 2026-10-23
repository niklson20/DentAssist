import { z } from "zod";

import { formatBelgradeDate, hasTurned15, isIsoDate } from "@/lib/calendar-dates";
import { RELATIONSHIPS, type Relationship } from "@/lib/labels";
import { normalizePhone } from "@/lib/phone";

import { CLINIC_UNAVAILABLE } from "../registracija/schema";

export const BOOKING_UNAVAILABLE = "Zakazivanje trenutno nije dostupno. Pokušajte ponovo.";
export const CHECK_BOOKING = "Proverite unete podatke.";
export const PICK_SLOT = "Izaberite slobodan početak.";
export const CHILD_ROUTE_TEXT =
  "Osoba još nema 15 godina. Termin se zakazuje kao za dete, a uneti datum rođenja ostaje.";
export const CHILD_BOOKS_ALONE =
  "Osoba od 15 godina zakazuje sama. Roditelj je online ne zakazuje.";
export const GUARDIAN_STATEMENT = "Zakazujem kao roditelj ili zakonski staratelj.";
export const NOT_PROCEDURE_CONSENT = "Zakazivanje nije pristanak na zahvat.";
export const EMAIL_IS_ACCOUNT = "Mejl je mejl ovog naloga.";
export const REQUEST_RECEIVED = "Zahtev je primljen. Ordinacija treba da ga potvrdi.";
export const SLOT_TAKEN = "Ovaj početak je zauzet. Izaberite drugi početak.";
export const TWO_PENDING = "Već imate dva zahteva koja čekaju u ovoj ordinaciji.";
export const PHONE_REQUIRED = "Unesite telefon.";
export const BIRTH_DATE_REQUIRED = "Unesite datum rođenja.";

/** Clinic page, where a signed-in patient picks another free start. */
export function freeStartsHref(slug: string): string {
  return `/ordinacije/${slug}`;
}

export type BookingChild = {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  relationship: Relationship;
  linked: boolean;
};

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLOT_START =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

const birthDate = z
  .string({ error: "Unesite datum rođenja." })
  .trim()
  .refine(isBirthDate, "Unesite datum rođenja.");

export function bookingConsentText(clinicName: string): string {
  return `Slažem se da ordinacija ${clinicName} obradi ime, prezime, datum rođenja, telefon i mejl radi zakazivanja termina.`;
}

/** Empty or unreadable dates stay on the self form so the patient can fill them in. */
export function isChildRoute(dateOfBirth: string | null | undefined, today: string): boolean {
  const date = dateOfBirth?.trim() ?? "";
  if (!date || !isIsoDate(date) || !isIsoDate(today)) {
    return false;
  }
  return !hasTurned15(date, today);
}

export const selfBookingSlotSchema = z.object({
  slug: z
    .string({ error: CLINIC_UNAVAILABLE })
    .trim()
    .min(1, CLINIC_UNAVAILABLE)
    .max(200, CLINIC_UNAVAILABLE)
    .toLowerCase()
    .pipe(z.string().regex(SLUG, CLINIC_UNAVAILABLE)),
  stomatolog: z
    .string({ error: PICK_SLOT })
    .trim()
    .uuid(PICK_SLOT),
  pocetak: z.string({ error: PICK_SLOT }).trim().regex(SLOT_START, PICK_SLOT),
  reason: z
    .string({ error: "Unesite razlog." })
    .trim()
    .max(300, "Razlog može imati najviše 300 znakova."),
});

export const selfBookingIdentitySchema = selfBookingSlotSchema.extend({
  firstName: requiredName("Unesite ime.", "Ime može imati najviše 80 znakova."),
  lastName: requiredName("Unesite prezime.", "Prezime može imati najviše 80 znakova."),
  dateOfBirth: birthDate,
  phone: z
    .string({ error: "Unesite telefon." })
    .trim()
    .min(1, "Unesite telefon.")
    .refine((value) => normalizePhone(value) !== null, "Unesite ispravan telefon."),
  email: z
    .string({ error: "Unesite mejl." })
    .trim()
    .min(1, "Unesite mejl.")
    .toLowerCase()
    .pipe(z.email("Unesite ispravan mejl.")),
  consent: z.literal("yes", { error: "Prihvatite saglasnost." }),
});

const dependentId = z
  .string({ error: "Izaberite dete." })
  .trim()
  .toLowerCase()
  .pipe(z.string().uuid("Izaberite dete."));

export const childBookingLinkedSchema = selfBookingSlotSchema.extend({
  dependentId,
  guardian: z.literal("yes", { error: "Potvrdite izjavu staratelja." }),
});

export const childBookingIdentitySchema = selfBookingSlotSchema.extend({
  dependentId: z
    .string({ error: "Izaberite dete." })
    .trim()
    .toLowerCase()
    .refine((value) => value === "" || z.string().uuid().safeParse(value).success, "Izaberite dete."),
  childFirstName: requiredName("Unesite ime.", "Ime može imati najviše 80 znakova."),
  childLastName: requiredName("Unesite prezime.", "Prezime može imati najviše 80 znakova."),
  childDateOfBirth: birthDate,
  relationship: z.enum(RELATIONSHIPS, { error: "Izaberite odnos." }),
  contactFirstName: requiredName("Unesite ime.", "Ime može imati najviše 80 znakova."),
  contactLastName: requiredName("Unesite prezime.", "Prezime može imati najviše 80 znakova."),
  contactPhone: z
    .string({ error: "Unesite telefon." })
    .trim()
    .min(1, "Unesite telefon.")
    .refine((value) => normalizePhone(value) !== null, "Unesite ispravan telefon."),
  contactEmail: z
    .string({ error: "Unesite mejl." })
    .trim()
    .min(1, "Unesite mejl.")
    .toLowerCase()
    .pipe(z.email("Unesite ispravan mejl.")),
  guardian: z.literal("yes", { error: "Potvrdite izjavu staratelja." }),
  consent: z.literal("yes", { error: "Prihvatite saglasnost." }),
});

function requiredName(empty: string, tooLong: string) {
  return z.string({ error: empty }).trim().min(1, empty).max(80, tooLong);
}

function isBirthDate(value: string): boolean {
  if (!isIsoDate(value) || value < "1900-01-01") {
    return false;
  }
  return value <= formatBelgradeDate(new Date());
}
