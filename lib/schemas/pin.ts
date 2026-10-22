import { z } from "zod";

export const receptionPinSchema = z.object({
  memberId: z.uuid({ error: "Izaberite osobu." }),
  pin: z
    .string({ error: "Unesite PIN od 6 cifara." })
    .regex(/^\d{6}$/, "Unesite PIN od 6 cifara."),
});

export const receptionPasswordSchema = z.object({
  memberId: z.uuid({ error: "Izaberite osobu." }),
  password: z.string({ error: "Unesite lozinku." }).min(1, "Unesite lozinku."),
});

export type ReceptionPinInput = z.infer<typeof receptionPinSchema>;
export type ReceptionPasswordInput = z.infer<typeof receptionPasswordSchema>;
