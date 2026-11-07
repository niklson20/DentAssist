import { z } from "zod";

import { APPOINTMENT_STATUSES } from "@/lib/labels";

export const APPOINTMENTS_UNAVAILABLE = "Spisak trenutno nije dostupan. Pokušajte ponovo.";

const instant = z.string().refine((value) => Number.isFinite(Date.parse(value)));

export const profileAppointmentRowSchema = z
  .object({
    starts_at: instant,
    ends_at: instant,
    clinic_name: z.string().trim().min(1).max(200),
    dentist_first_name: z.string().trim().min(1).max(80),
    dentist_last_name: z.string().trim().min(1).max(80),
    status: z.enum(APPOINTMENT_STATUSES),
  })
  .strip();
