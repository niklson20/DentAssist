import { createSupabaseServerClient } from "@/lib/supabase/server";

import { parsePublicDentists, type PublicDentist } from "./dentist-preference";

export type ClinicPublicView = {
  name: string;
  slug: string;
  city: string;
  address: string;
  phone: string;
  description: string;
  logoUrl: string | null;
  dentists: PublicDentist[];
  maxAheadDays: number;
  defaultDurationMin: number;
};

export type ClinicPublicLoad =
  | { status: "ready"; clinic: ClinicPublicView }
  | { status: "unavailable" };

type ClinicPublicRow = {
  name: string;
  slug: string;
  city: string;
  address: string;
  phone: string;
  logo_path: string | null;
  description: string | null;
  dentists: unknown;
  max_ahead_days: number;
  default_duration_min: number;
};

export async function loadClinicPublic(slug: string): Promise<ClinicPublicLoad> {
  const trimmed = slug.trim();
  if (!trimmed) {
    return { status: "unavailable" };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_clinic_public", { slug: trimmed });

    if (error) {
      console.error("load_clinic_public rejected:", error.message);
      return { status: "unavailable" };
    }

    const row = (data as ClinicPublicRow[] | null)?.[0];
    if (!row) {
      return { status: "unavailable" };
    }

    return {
      status: "ready",
      clinic: {
        name: row.name,
        slug: row.slug,
        city: row.city,
        address: row.address,
        phone: row.phone,
        description: row.description?.trim() ?? "",
        logoUrl: publicLogoUrl(row.logo_path),
        dentists: parsePublicDentists(row.dentists),
        maxAheadDays: row.max_ahead_days,
        defaultDurationMin: row.default_duration_min,
      },
    };
  } catch (loadError) {
    console.error(
      "load_clinic_public failed:",
      loadError instanceof Error ? loadError.name : "unknown error",
    );
    return { status: "unavailable" };
  }
}

function publicLogoUrl(logoPath: string | null): string | null {
  if (!logoPath) {
    return null;
  }
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base) {
    return null;
  }
  return `${base}/storage/v1/object/public/clinic-logos/${logoPath}`;
}
