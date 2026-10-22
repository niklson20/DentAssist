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

const inviteToken = z
  .string({ error: "Ovaj link više ne važi." })
  .trim()
  .min(1, "Ovaj link više ne važi.");

function requiredName(empty: string, max: number) {
  return z.string({ error: empty }).trim().min(1, empty).max(max, empty);
}

export const clinicInviteSchema = z.object({
  token: inviteToken,
  clinicName: requiredName("Unesite naziv ordinacije.", 120),
  firstName: requiredName("Unesite ime.", 80),
  lastName: requiredName("Unesite prezime.", 80),
  code: z
    .string({ error: "Unesite kod od 6 cifara." })
    .trim()
    .regex(/^\d{6}$/, "Unesite kod od 6 cifara."),
  password: z.string({ error: "Unesite lozinku." }).min(1, "Unesite lozinku."),
});

export const clinicInviteResendSchema = z.object({
  token: inviteToken,
});

export type SignInInput = z.infer<typeof signInSchema>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
export type NewPasswordInput = z.infer<typeof newPasswordSchema>;
export type ClinicInviteInput = z.infer<typeof clinicInviteSchema>;
export type ClinicInviteResendInput = z.infer<typeof clinicInviteResendSchema>;
