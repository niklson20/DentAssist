import { z } from "zod";

import { formatBelgradeDate, isIsoDate } from "@/lib/calendar-dates";
import { RELATIONSHIPS } from "@/lib/labels";

export const ADD_CHILD_UNAVAILABLE = "Dodavanje trenutno nije moguće. Pokušajte ponovo.";

const birthDate = z
  .string({ error: "Unesite datum rođenja." })
  .trim()
  .refine(isBirthDate, "Unesite datum rođenja.");

function requiredName(empty: string) {
  return z.string({ error: empty }).trim().min(1, empty).max(80, empty);
}

export const addChildSchema = z.object({
  slug: z.string({ error: "Ova ordinacija nije dostupna za online zakazivanje." }).trim().min(1),
  firstName: requiredName("Unesite ime."),
  lastName: requiredName("Unesite prezime."),
  dateOfBirth: birthDate,
  relationship: z.enum(RELATIONSHIPS, { error: "Izaberite odnos." }),
});

function isBirthDate(value: string): boolean {
  if (!isIsoDate(value) || value < "1900-01-01") {
    return false;
  }
  return value <= formatBelgradeDate(new Date());
}
