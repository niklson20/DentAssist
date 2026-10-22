import { z } from "zod";

export const appointmentTypeNameSchema = z
  .string({ error: "Unesite naziv." })
  .trim()
  .min(1, "Unesite naziv.")
  .max(100, "Naziv je predugačak.");

export const addAppointmentTypeSchema = z.object({
  name: appointmentTypeNameSchema,
});

export const renameAppointmentTypeSchema = z.object({
  typeId: z.string().uuid("Neispravan tip."),
  name: appointmentTypeNameSchema,
});

export const appointmentTypeIdSchema = z.object({
  typeId: z.string().uuid("Neispravan tip."),
});
