import { z } from "zod";

import { durationOptionsForSlot } from "@/app/podesavanja/ordinacija/schema";

const slotMinutesSchema = z.coerce
  .number({ error: "Izaberite korak." })
  .refine((value) => value === 15 || value === 30, "Izaberite korak.");

const bufferMinutesSchema = z.coerce
  .number({ error: "Izaberite razmak." })
  .refine((value) => [0, 5, 10, 15].includes(value), "Izaberite razmak.");

export const guideProfileSchema = z.object({
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
});

export const guideSeesPatientsSchema = z.object({
  seesPatients: z.enum(["true", "false"], { error: "Izaberite odgovor." }),
});

export const guideSchedulingSchema = z
  .object({
    typeName: z
      .string({ error: "Unesite naziv tipa." })
      .trim()
      .min(1, "Unesite naziv tipa.")
      .max(100, "Naziv je predugačak."),
    slotMinutes: slotMinutesSchema,
    bufferMinutes: bufferMinutesSchema,
    defaultDurationMin: z.coerce
      .number({ error: "Izaberite trajanje." })
      .int("Izaberite trajanje."),
  })
  .superRefine((value, ctx) => {
    const options = durationOptionsForSlot(value.slotMinutes);
    if (!options.includes(value.defaultDurationMin)) {
      ctx.addIssue({
        code: "custom",
        message: "Trajanje mora da bude umnožak koraka.",
        path: ["defaultDurationMin"],
      });
    }
  });

export const guideNoticeSchema = z.object({
  minNoticeMinutes: z.coerce
    .number({ error: "Unesite najavu." })
    .int("Unesite najavu.")
    .min(0, "Najava ne može biti negativna."),
  maxAheadDays: z.coerce
    .number({ error: "Unesite horizont." })
    .int("Unesite horizont.")
    .min(0, "Horizont ne može biti negativan."),
});

export const guideOnlineSchema = z.object({
  onlineBookingEnabled: z.enum(["true", "false"], { error: "Izaberite opciju." }),
});
