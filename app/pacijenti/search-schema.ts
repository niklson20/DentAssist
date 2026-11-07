import { z } from "zod";

import { isIsoDate } from "@/lib/calendar-dates";
import { normalizePhone } from "@/lib/phone";

export const patientSearchQuerySchema = z.object({
  pretraga: z.string().trim().max(120).optional(),
});

export type PatientSearchRow = {
  firstName: string;
  lastName: string;
  phone: string | null;
};

export function normalizePatientSearchTerm(value: string): string {
  return value.trim().toLocaleLowerCase("sr");
}

export function patientMatchesSearch(patient: PatientSearchRow, query: string): boolean {
  const term = normalizePatientSearchTerm(query);
  if (!term) {
    return false;
  }

  const fields = [patient.firstName, patient.lastName, patient.phone ?? ""];
  return fields.some((field) => normalizePatientSearchTerm(field).includes(term));
}

const blankToNull = (value: string) => (value.length > 0 ? value : null);

export function newPatientFormSchema(today: string) {
  return z.object({
    firstName: z.string().trim().min(1, "Ime je obavezno.").max(80, "Ime može imati najviše 80 znakova."),
    lastName: z.string().trim().min(1, "Prezime je obavezno.").max(80, "Prezime može imati najviše 80 znakova."),
    phone: z
      .string()
      .trim()
      .max(40, "Telefon može imati najviše 40 znakova.")
      .transform((value) => (value.length === 0 ? null : (normalizePhone(value) ?? value))),
    dateOfBirth: z
      .string()
      .trim()
      .transform(blankToNull)
      .refine((value) => value === null || isIsoDate(value), "Unesite ispravan datum rođenja.")
      .refine((value) => value === null || value <= today, "Datum rođenja ne može biti u budućnosti."),
    sex: z
      .string()
      .trim()
      .refine((value) => value === "" || value === "male" || value === "female", "Izaberite pol.")
      .transform((value) => (value === "male" || value === "female" ? value : null)),
    email: z
      .string()
      .trim()
      .max(200, "Mejl može imati najviše 200 znakova.")
      .transform((value) => blankToNull(value.toLowerCase()))
      .refine((value) => value === null || z.email().safeParse(value).success, "Unesite ispravan mejl."),
    address: z.string().trim().max(200, "Adresa može imati najviše 200 znakova.").transform(blankToNull),
    note: z.string().trim().max(500, "Beleška može imati najviše 500 znakova.").transform(blankToNull),
    duplicateConfirmed: z.boolean(),
  });
}

export function chartDetailsSchema(today: string) {
  return newPatientFormSchema(today).pick({
    firstName: true,
    lastName: true,
    phone: true,
    dateOfBirth: true,
    sex: true,
    email: true,
    address: true,
    note: true,
    duplicateConfirmed: true,
  });
}

export const DUPLICATE_CONFIRMATION_REQUIRED =
  "U ordinaciji već postoji pacijent sa istim imenom i prezimenom. Potvrdite unos.";

export function needsDuplicateNameConfirmation(
  existing: readonly { firstName: string; lastName: string }[],
  firstName: string,
  lastName: string,
): boolean {
  const first = normalizePatientSearchTerm(firstName);
  const last = normalizePatientSearchTerm(lastName);
  if (!first || !last) {
    return false;
  }

  return existing.some(
    (row) =>
      normalizePatientSearchTerm(row.firstName) === first &&
      normalizePatientSearchTerm(row.lastName) === last,
  );
}

export function parseDuplicateConfirmation(value: FormDataEntryValue | null): boolean {
  return value === "da" || value === "on" || value === "true";
}
