import { cookies } from "next/headers";

import type { StaffRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SESSION_GATE_COOKIE } from "@/proxy";

/** Role for the clinic menu. Anonymous, patient, and platform sessions stay out of the lookup. */
export async function loadStaffMenuRole(): Promise<StaffRole | null> {
  const store = await cookies();
  if (store.get(SESSION_GATE_COOKIE)?.value !== "staff") {
    return null;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("current_member_role");
    if (error) {
      console.error("current_member_role failed:", error.message);
      return null;
    }
    if (data === "owner" || data === "dentist" || data === "reception") {
      return data;
    }
    return null;
  } catch (error) {
    console.error("Staff menu role failed:", error instanceof Error ? error.message : "unknown error");
    return null;
  }
}
