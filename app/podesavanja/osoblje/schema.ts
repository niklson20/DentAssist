import { z } from "zod";

import { MEMBER_ROLES } from "@/lib/labels";

const staffInviteRoles = ["dentist", "reception"] as const;

export const staffInviteSendSchema = z.object({
  firstName: z
    .string({ error: "Unesite ime." })
    .trim()
    .min(1, "Unesite ime.")
    .max(100, "Unesite ime."),
  lastName: z
    .string({ error: "Unesite prezime." })
    .trim()
    .min(1, "Unesite prezime.")
    .max(100, "Unesite prezime."),
  email: z
    .string({ error: "Unesite mejl." })
    .trim()
    .min(1, "Unesite mejl.")
    .toLowerCase()
    .pipe(z.email("Unesite ispravan mejl.")),
  role: z.enum(staffInviteRoles, { error: "Izaberite ulogu." }),
});

export const memberIdSchema = z.object({
  memberId: z.string().uuid("Neispravan član."),
});

export const memberUnavailableSchema = memberIdSchema.extend({
  unavailable: z.enum(["true", "false"]),
});

export const memberListedSchema = memberIdSchema.extend({
  listedOnline: z.enum(["true", "false"]),
});

export const transferOwnershipSchema = z.object({
  targetMemberId: z.string().uuid("Izaberite kolegu."),
});

export type StaffInviteSendInput = z.infer<typeof staffInviteSendSchema>;

export function isStaffInviteRole(value: string): value is (typeof staffInviteRoles)[number] {
  return value === "dentist" || value === "reception";
}

export function isMemberRole(value: string): boolean {
  return (MEMBER_ROLES as readonly string[]).includes(value);
}
