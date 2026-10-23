import { z } from "zod";

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

export const newPatientFormSchema = z.object({
  firstName: z.string().trim().min(1, "Ime je obavezno."),
  lastName: z.string().trim().min(1, "Prezime je obavezno."),
  phone: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  duplicateConfirmed: z.boolean(),
});

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
