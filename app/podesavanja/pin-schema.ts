import { z } from "zod";

export const settingsPinSchema = z.object({
  pin: z
    .string({ error: "Unesite PIN od 6 cifara." })
    .trim()
    .regex(/^\d{6}$/, "Unesite PIN od 6 cifara."),
});

export type SettingsPinInput = z.infer<typeof settingsPinSchema>;
