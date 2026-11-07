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
  weekdayHours: ClinicHoursRange | null;
  weekendHours: ClinicHoursRange | null;
  weekdayHasSchedule: boolean;
  weekendHasSchedule: boolean;
};

export type ClinicHoursRange = {
  opensAt: string;
  closesAt: string;
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
  weekday_opens_at: string | null;
  weekday_closes_at: string | null;
  weekend_opens_at: string | null;
  weekend_closes_at: string | null;
  weekday_has_schedule: boolean;
  weekend_has_schedule: boolean;
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
        weekdayHours: mapHoursRange(row.weekday_opens_at, row.weekday_closes_at),
        weekendHours: mapHoursRange(row.weekend_opens_at, row.weekend_closes_at),
        weekdayHasSchedule: row.weekday_has_schedule,
        weekendHasSchedule: row.weekend_has_schedule,
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

function mapHoursRange(
  opensAt: string | null,
  closesAt: string | null,
): ClinicHoursRange | null {
  if (!opensAt || !closesAt) {
    return null;
  }
  return { opensAt, closesAt };
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
