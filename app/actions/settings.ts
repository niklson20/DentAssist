"use server";

import { revalidatePath } from "next/cache";
import type { ZodError } from "zod";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireOwner } from "@/lib/auth";
import { normalizePhone } from "@/lib/phone";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  clinicProfileSchema,
  LOGO_MAX_BYTES,
  LOGO_MIME_TYPES,
} from "@/app/podesavanja/ordinacija/schema";

const CLINIC_PATH = "/podesavanja/ordinacija";
const SAVE_UNAVAILABLE = "Čuvanje trenutno nije moguće. Pokušajte ponovo.";
const LOGO_INVALID = "Logo mora biti JPEG, PNG ili WebP, do 1 MB.";

type ClinicRow = {
  address: string;
  city: string;
  logo_path: string | null;
};

export async function saveClinicProfile(
  _previous: ActionResult<{ saved: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ saved: true }>> {
  const member = await requireOwner();
  const parsed = clinicProfileSchema.safeParse(readProfileFields(formData));
  if (!parsed.success) {
    return fail("Proverite unete podatke.", fieldErrorsFrom(parsed.error));
  }

  const phone = normalizePhone(parsed.data.phone);
  if (!phone) {
    return fail("Proverite unete podatke.", { phone: ["Unesite ispravan telefon."] });
  }

  const logoFile = readLogoFile(formData);
  if (logoFile && "error" in logoFile) {
    return fail("Proverite unete podatke.", { logo: [logoFile.error] });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const current = await loadCurrentClinic(supabase, member.clinicId);
    if (!current) {
      return fail(SAVE_UNAVAILABLE);
    }

    const addressChanged =
      parsed.data.address !== current.address.trim() || parsed.data.city !== current.city.trim();
    const coordinates = addressChanged
      ? await geocodeAddress(parsed.data.address, parsed.data.city)
      : null;

    const update: Record<string, unknown> = {
      name: parsed.data.name,
      city: parsed.data.city,
      address: parsed.data.address,
      phone,
      description: parsed.data.description.trim() ? parsed.data.description.trim() : null,
      online_booking_enabled: parsed.data.onlineBookingEnabled,
      slot_minutes: parsed.data.slotMinutes,
      buffer_minutes: parsed.data.bufferMinutes,
      default_duration_min: parsed.data.defaultDurationMin,
      min_notice_minutes: parsed.data.minNoticeMinutes,
      max_ahead_days: parsed.data.maxAheadDays,
    };

    if (addressChanged) {
      update.latitude = coordinates?.latitude ?? null;
      update.longitude = coordinates?.longitude ?? null;
    }

    const { error: updateError } = await supabase.from("clinics").update(update).eq("id", member.clinicId);
    if (updateError) {
      console.error("save_clinic_profile rejected:", updateError.code ?? "unknown");
      return fail(SAVE_UNAVAILABLE);
    }

    if (logoFile) {
      const stored = await storeLogo(supabase, member.clinicId, logoFile.file);
      if (!stored.ok) {
        return fail(SAVE_UNAVAILABLE);
      }
      const { error: logoError } = await supabase
        .from("clinics")
        .update({ logo_path: stored.logoPath })
        .eq("id", member.clinicId);
      if (logoError) {
        console.error("save_clinic_logo_path rejected:", logoError.code ?? "unknown");
        return fail(SAVE_UNAVAILABLE);
      }
    }
  } catch (error) {
    console.error("save_clinic_profile failed:", error instanceof Error ? error.name : "unknown error");
    return fail(SAVE_UNAVAILABLE);
  }

  revalidatePath(CLINIC_PATH);
  return ok({ saved: true });
}

function readProfileFields(formData: FormData) {
  return {
    name: formData.get("name"),
    city: formData.get("city"),
    address: formData.get("address"),
    phone: formData.get("phone"),
    description: formData.get("description") ?? "",
    onlineBookingEnabled: formData.get("onlineBookingEnabled") === "true",
    slotMinutes: formData.get("slotMinutes"),
    bufferMinutes: formData.get("bufferMinutes"),
    defaultDurationMin: formData.get("defaultDurationMin"),
    minNoticeMinutes: formData.get("minNoticeMinutes"),
    maxAheadDays: formData.get("maxAheadDays"),
  };
}

function readLogoFile(formData: FormData): { file: File } | { error: string } | null {
  const value = formData.get("logo");
  if (!(value instanceof File) || value.size === 0) {
    return null;
  }
  if (value.size > LOGO_MAX_BYTES) {
    return { error: LOGO_INVALID };
  }
  if (!LOGO_MIME_TYPES.has(value.type)) {
    return { error: LOGO_INVALID };
  }
  return { file: value };
}

async function loadCurrentClinic(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  clinicId: string,
): Promise<ClinicRow | null> {
  const { data, error } = await supabase
    .from("clinics")
    .select("address, city, logo_path")
    .eq("id", clinicId)
    .maybeSingle();
  if (error || !data) {
    console.error("load_current_clinic rejected:", error?.code ?? "empty");
    return null;
  }
  return data;
}

async function storeLogo(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  clinicId: string,
  file: File,
): Promise<{ ok: true; logoPath: string } | { ok: false }> {
  const extension = logoExtension(file.type);
  if (!extension) {
    return { ok: false };
  }
  const logoPath = `${clinicId}/logo.${extension}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error } = await supabase.storage.from("clinic-logos").upload(logoPath, bytes, {
    contentType: file.type,
    upsert: true,
  });
  if (error) {
    console.error("clinic_logo_upload rejected:", error.message);
    return { ok: false };
  }
  return { ok: true, logoPath };
}

function logoExtension(mime: string): "jpg" | "png" | "webp" | null {
  if (mime === "image/jpeg") {
    return "jpg";
  }
  if (mime === "image/png") {
    return "png";
  }
  if (mime === "image/webp") {
    return "webp";
  }
  return null;
}

export async function geocodeAddress(
  address: string,
  city: string,
): Promise<{ latitude: number; longitude: number } | null> {
  const query = `${address}, ${city}, Serbia`;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", query);

  const appUrl = process.env.APP_URL?.trim() || "https://dentassist.rs";
  const response = await fetch(url, {
    headers: {
      "User-Agent": `DentAssist (${appUrl})`,
      Accept: "application/json",
    },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    console.error("nominatim rejected:", response.status);
    return null;
  }

  const payload = (await response.json()) as Array<{ lat?: string; lon?: string }>;
  const hit = payload[0];
  if (!hit?.lat || !hit.lon) {
    return null;
  }

  const latitude = Number.parseFloat(hit.lat);
  const longitude = Number.parseFloat(hit.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
}

function fieldErrorsFrom(error: ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    (result[field] ??= []).push(issue.message);
  }
  return result;
}
