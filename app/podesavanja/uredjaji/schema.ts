import { z } from "zod";

export const deviceLabelSchema = z
  .string({ error: "Unesite naziv." })
  .trim()
  .min(1, "Unesite naziv.")
  .max(80, "Naziv je predugačak.");

export const pairDeviceSchema = z.object({
  label: deviceLabelSchema,
});

export const deviceIdSchema = z.object({
  deviceId: z.string().uuid("Neispravan uređaj."),
});
