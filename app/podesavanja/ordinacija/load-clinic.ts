import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ClinicProfileView = {
  name: string;
  slug: string;
  city: string;
  address: string;
  phone: string;
  description: string;
  logoUrl: string | null;
  onlineBookingEnabled: boolean;
  slotMinutes: 15 | 30;
  bufferMinutes: 0 | 5 | 10 | 15;
  defaultDurationMin: number;
  minNoticeMinutes: number;
  maxAheadDays: number;
};

export type ClinicProfileLoad =
  | { status: "ready"; clinic: ClinicProfileView; publicPageUrl: string }
  | { status: "unavailable" };

export async function loadClinicProfile(clinicId: string): Promise<ClinicProfileLoad> {
  const appUrl = process.env.APP_URL?.trim();
  if (!appUrl) {
    console.error("load_clinic_profile rejected: missing APP_URL");
    return { status: "unavailable" };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("clinics")
      .select(
        "name, slug, city, address, phone, description, logo_path, online_booking_enabled, slot_minutes, buffer_minutes, default_duration_min, min_notice_minutes, max_ahead_days",
      )
      .eq("id", clinicId)
      .maybeSingle();

    if (error || !data) {
      console.error("load_clinic_profile rejected:", error?.code ?? "empty");
      return { status: "unavailable" };
    }

    const publicPageUrl = `${appUrl.replace(/\/$/, "")}/ordinacije/${data.slug}`;
    const logoUrl = publicLogoUrl(data.logo_path);

    return {
      status: "ready",
      publicPageUrl,
      clinic: {
        name: data.name,
        slug: data.slug,
        city: data.city,
        address: data.address,
        phone: data.phone,
        description: data.description ?? "",
        logoUrl,
        onlineBookingEnabled: data.online_booking_enabled,
        slotMinutes: data.slot_minutes as 15 | 30,
        bufferMinutes: data.buffer_minutes as 0 | 5 | 10 | 15,
        defaultDurationMin: data.default_duration_min,
        minNoticeMinutes: data.min_notice_minutes,
        maxAheadDays: data.max_ahead_days,
      },
    };
  } catch (error) {
    console.error("load_clinic_profile failed:", error instanceof Error ? error.name : "unknown error");
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
