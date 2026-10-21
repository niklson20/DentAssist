import { z } from "zod";

export const signInSchema = z.object({
  email: z
    .string({ error: "Unesite mejl." })
    .trim()
    .min(1, "Unesite mejl.")
    .toLowerCase()
    .pipe(z.email("Unesite ispravan mejl.")),
  password: z.string({ error: "Unesite lozinku." }).min(1, "Unesite lozinku."),
  remember: z.boolean(),
});

export type SignInInput = z.infer<typeof signInSchema>;
