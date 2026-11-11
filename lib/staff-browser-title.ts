import type { Metadata } from "next";
import { cookies } from "next/headers";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SESSION_GATE_COOKIE } from "@/proxy";

/** Clinic display name for the staff session gate. Other gates skip the lookup. */
export async function loadStaffClinicName(): Promise<string | null> {
  const store = await cookies();
  if (store.get(SESSION_GATE_COOKIE)?.value !== "staff") {
    return null;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const clinicIdResult = await supabase.rpc("current_clinic_id");
    if (clinicIdResult.error) {
      console.error("current_clinic_id failed:", clinicIdResult.error.message);
      return null;
    }
    const clinicId = typeof clinicIdResult.data === "string" ? clinicIdResult.data.trim() : "";
    if (!clinicId) {
      return null;
    }

    const clinic = await supabase.from("clinics").select("name").eq("id", clinicId).maybeSingle();
    if (clinic.error) {
      console.error("staff clinic name failed:", clinic.error.message);
      return null;
    }
    const name = typeof clinic.data?.name === "string" ? clinic.data.name.trim() : "";
    return name || null;
  } catch (error) {
    console.error("staff clinic name failed:", error instanceof Error ? error.message : "unknown error");
    return null;
  }
}

export async function staffBrowserTitle(page: string): Promise<Metadata> {
  const clinicName = await loadStaffClinicName();
  return {
    title: clinicName ? `${page} — ${clinicName}` : `${page} — DentAssist`,
  };
}

export async function staffBrowserTitleTemplate(defaultPage: string): Promise<Metadata> {
  const clinicName = await loadStaffClinicName();
  const brand = clinicName ?? "DentAssist";
  return {
    title: {
      default: `${defaultPage} — ${brand}`,
      template: `%s — ${brand}`,
    },
  };
}
