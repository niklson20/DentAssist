import { z } from "zod";

import { normalizeClinicSlug } from "@/lib/password-reset";

const emailSchema = z
  .string({ error: "Unesite mejl." })
  .trim()
  .min(1, "Unesite mejl.")
  .toLowerCase()
  .pipe(z.email("Unesite ispravan mejl."));

const optionalClinicSlug = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => normalizeClinicSlug(typeof value === "string" ? value : undefined));

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string({ error: "Unesite lozinku." }).min(1, "Unesite lozinku."),
  remember: z.boolean(),
});

export const passwordResetRequestSchema = z.object({
  email: emailSchema,
  audience: z.enum(["staff", "patient"], { error: "Proverite unete podatke." }),
  clinicSlug: optionalClinicSlug,
});

export const newPasswordSchema = z.object({
  token: z.string({ error: "Ovaj link više ne važi." }).trim().min(1, "Ovaj link više ne važi."),
  password: z.string({ error: "Unesite lozinku." }).min(1, "Unesite lozinku."),
  clinicSlug: optionalClinicSlug,
});

export type SignInInput = z.infer<typeof signInSchema>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
export type NewPasswordInput = z.infer<typeof newPasswordSchema>;
