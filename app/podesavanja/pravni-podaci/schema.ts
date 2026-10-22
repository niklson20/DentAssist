import { z } from "zod";

function optionalLegalField(label: string) {
  return z
    .string()
    .trim()
    .max(50, `${label} je predugačak.`)
    .transform((value) => (value.length === 0 ? null : value));
}

export const legalDataSchema = z.object({
  taxId: optionalLegalField("PIB"),
  registrationNumber: optionalLegalField("Matični broj"),
  licenseNumber: optionalLegalField("Broj rešenja"),
});

export type LegalDataInput = z.infer<typeof legalDataSchema>;
