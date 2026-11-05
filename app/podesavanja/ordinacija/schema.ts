import { z } from "zod";

const slotMinutesSchema = z.coerce
  .number({ error: "Izaberite korak." })
  .refine((value) => value === 15 || value === 30, "Izaberite korak.");

const bufferMinutesSchema = z.coerce
  .number({ error: "Izaberite razmak." })
  .refine((value) => [0, 5, 10, 15].includes(value), "Izaberite razmak.");

export const DESCRIPTION_MAX_LENGTH = 500;

function singleLineBreaks(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export const clinicProfileSchema = z
  .object({
    name: z
      .string({ error: "Unesite naziv." })
      .trim()
      .min(1, "Unesite naziv.")
      .max(200, "Naziv je predugačak."),
    city: z
      .string({ error: "Unesite grad." })
      .trim()
      .min(1, "Unesite grad.")
      .max(200, "Unesite grad."),
    address: z
      .string({ error: "Unesite adresu." })
      .trim()
      .min(1, "Unesite adresu.")
      .max(300, "Adresa je predugačka."),
    phone: z.string({ error: "Unesite telefon." }).trim().min(1, "Unesite telefon."),
    description: z
      .string()
      .overwrite(singleLineBreaks)
      .max(DESCRIPTION_MAX_LENGTH, "Tekst je predugačak.")
      .optional()
      .default(""),
    onlineBookingEnabled: z.boolean(),
    slotMinutes: slotMinutesSchema,
    bufferMinutes: bufferMinutesSchema,
    defaultDurationMin: z.coerce
      .number({ error: "Izaberite trajanje." })
      .int("Izaberite trajanje."),
    minNoticeMinutes: z.coerce
      .number({ error: "Unesite najavu." })
      .int("Unesite najavu.")
      .min(0, "Najava ne može biti negativna."),
    maxAheadDays: z.coerce
      .number({ error: "Unesite horizont." })
      .int("Unesite horizont.")
      .min(0, "Horizont ne može biti negativan."),
  })
  .superRefine((value, ctx) => {
    if (value.defaultDurationMin < 15 || value.defaultDurationMin > 120) {
      ctx.addIssue({
        code: "custom",
        message: "Izaberite trajanje.",
        path: ["defaultDurationMin"],
      });
      return;
    }
    if (value.defaultDurationMin % value.slotMinutes !== 0) {
      ctx.addIssue({
        code: "custom",
        message: "Trajanje mora da bude umnožak koraka.",
        path: ["defaultDurationMin"],
      });
    }
  });

export type ClinicProfileInput = z.infer<typeof clinicProfileSchema>;

export const LOGO_MAX_BYTES = 1024 * 1024;

export const LOGO_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function durationOptionsForSlot(slotMinutes: 15 | 30): number[] {
  const options: number[] = [];
  for (let minutes = slotMinutes; minutes <= 120; minutes += slotMinutes) {
    options.push(minutes);
  }
  return options;
}
