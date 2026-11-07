import { z } from "zod";

export const CLINIC_UNAVAILABLE = "Ova ordinacija nije dostupna za online zakazivanje.";

export const PATIENT_EMAIL_CODE_SUBJECT = "Potvrdite mejl";

const emailSchema = z
  .string({ error: "Unesite mejl." })
  .trim()
  .min(1, "Unesite mejl.")
  .toLowerCase()
  .pipe(z.email("Unesite ispravan mejl."));

const optionalText = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => (typeof value === "string" ? value : undefined));

const turnstileToken = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (typeof value !== "string") {
      return undefined;
    }
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 2048) {
      return undefined;
    }
    return trimmed;
  });

function requiredName(empty: string) {
  return z.string({ error: empty }).trim().min(1, empty).max(80, empty);
}

const returnFields = {
  slug: z
    .union([z.string({ error: CLINIC_UNAVAILABLE }).trim().min(1, CLINIC_UNAVAILABLE), z.null()])
    .optional()
    .transform((value) => (typeof value === "string" ? value : undefined)),
  stomatolog: optionalText,
  pocetak: optionalText,
};

export const patientSignInSchema = z.object({
  email: emailSchema,
  password: z.string({ error: "Unesite lozinku." }).min(1, "Unesite lozinku."),
  ...returnFields,
});

export const patientRegisterSchema = z.object({
  firstName: requiredName("Unesite ime."),
  lastName: requiredName("Unesite prezime."),
  email: emailSchema,
  password: z.string({ error: "Unesite lozinku." }).min(1, "Unesite lozinku."),
  turnstileToken,
  ...returnFields,
});

export const patientEmailCodeSchema = z.object({
  code: z
    .string({ error: "Unesite kod od 6 cifara." })
    .trim()
    .regex(/^\d{6}$/, "Unesite kod od 6 cifara."),
  turnstileToken,
  ...returnFields,
});

export const patientEmailResendSchema = z.object({
  turnstileToken,
  ...returnFields,
});

export function patientEmailCodeText(code: string): string {
  return `Kod za potvrdu mejla je ${code}. Važi 10 minuta. Ako niste vi otvorili nalog, zanemarite poruku.`;
}
