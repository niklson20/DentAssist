import { cache } from "react";

import { hashInviteToken, staffInviteRoleLabel } from "@/lib/clinic-invite";
import { readClinicInvite, readStaffInvite } from "@/lib/supabase/admin";

export type InviteScreen =
  | { status: "clinic" }
  | { status: "staff"; clinicName: string; inviterName: string; roleLabel: string }
  | { status: "invalid" }
  | { status: "unavailable" };

/** Clinic invite wins when the token opens one. The code hash never leaves this module. */
export const loadInviteScreen = cache(async (token: string): Promise<InviteScreen> => {
  const tokenHash = hashInviteToken(token, process.env.TOKEN_PEPPER);
  if (!tokenHash) {
    return { status: "unavailable" };
  }

  const clinic = await readClinicInvite(tokenHash);
  if (clinic.status === "failed") {
    return { status: "unavailable" };
  }
  if (clinic.status === "ready") {
    return { status: "clinic" };
  }

  const staff = await readStaffInvite(tokenHash);
  if (staff.status === "failed") {
    return { status: "unavailable" };
  }
  if (staff.status !== "ready") {
    return { status: "invalid" };
  }

  return {
    status: "staff",
    clinicName: staff.clinicName,
    inviterName: staff.inviterName,
    roleLabel: staffInviteRoleLabel(staff.role),
  };
});
