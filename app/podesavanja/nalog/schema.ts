import { z } from "zod";

export const accountPasswordSchema = z.object({
  password: z.string({ error: "Unesite lozinku." }).min(1, "Unesite lozinku."),
});

export const accountPinSchema = z.object({
  pin: z
    .string({ error: "Unesite PIN od 6 cifara." })
    .trim()
    .regex(/^\d{6}$/, "Unesite PIN od 6 cifara."),
});

export type AccountPasswordInput = z.infer<typeof accountPasswordSchema>;
export type AccountPinInput = z.infer<typeof accountPinSchema>;
