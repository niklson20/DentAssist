"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ZodError } from "zod";

import { geocodeAddress } from "@/app/actions/settings";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireOwner } from "@/lib/auth";
import { normalizePhone } from "@/lib/phone";
import { allocateSlug, slugify } from "@/lib/slug";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  readWorkingHoursForm,
  toDbTime,
  workingHoursSaveSchema,
} from "@/app/podesavanja/radno-vreme/schema";

import { clearGuideStepCookie, writeGuideStepCookie } from "./guide-cookie";
import {
  guideNoticeSchema,
  guideOnlineSchema,
  guideProfileSchema,
  guideSchedulingSchema,
  guideSeesPatientsSchema,
} from "./schema";
import type { GuideStep } from "./steps";

const SETTINGS_PATH = "/podesavanja";
const SAVE_UNAVAILABLE = "Čuvanje trenutno nije moguće. Pokušajte ponovo.";
const DEFAULT_TYPE_NAME = "Pregled";

export async function acceptGuideTerms(
  _previous: ActionResult<{ saved: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ saved: true }>> {
  void formData;
  const member = await requireOwner();

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("clinics")
      .update({ terms_accepted_at: new Date().toISOString() })
      .eq("id", member.clinicId)
      .is("setup_completed_at", null);

    if (error) {
      console.error("accept_guide_terms rejected:", error.code);
      return fail(SAVE_UNAVAILABLE);
    }

    await writeGuideStepCookie("profile");
    revalidatePath(SETTINGS_PATH);
    return ok({ saved: true });
  } catch (error) {
    console.error("accept_guide_terms failed:", error instanceof Error ? error.name : "unknown error");
    return fail(SAVE_UNAVAILABLE);
  }
}

export async function saveGuideProfile(
  _previous: ActionResult<{ saved: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ saved: true }>> {
  const member = await requireOwner();
  const parsed = guideProfileSchema.safeParse({
    name: formData.get("name"),
    city: formData.get("city"),
    address: formData.get("address"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) {
    return fail("Proverite unete podatke.", fieldErrorsFrom(parsed.error));
  }

  const phone = normalizePhone(parsed.data.phone);
  if (!phone) {
    return fail("Proverite unete podatke.", { phone: ["Unesite ispravan telefon."] });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const current = await supabase
      .from("clinics")
      .select("name, city, address, slug, setup_completed_at")
      .eq("id", member.clinicId)
      .maybeSingle();

    if (current.error || !current.data || current.data.setup_completed_at) {
      return fail(SAVE_UNAVAILABLE);
    }

    const addressChanged =
      parsed.data.address !== (current.data.address ?? "").trim() ||
      parsed.data.city !== current.data.city.trim();
    const coordinates = addressChanged
      ? await geocodeAddress(parsed.data.address, parsed.data.city)
      : null;

    const update: Record<string, unknown> = {
      name: parsed.data.name,
      city: parsed.data.city,
      address: parsed.data.address,
      phone,
    };

    if (addressChanged) {
      update.latitude = coordinates?.latitude ?? null;
      update.longitude = coordinates?.longitude ?? null;
    }

    if (parsed.data.name.trim() !== current.data.name.trim()) {
      const slug = await nextSlugForName(supabase, parsed.data.name, current.data.slug);
      if (slug) {
        update.slug = slug;
      }
    }

    const { error } = await supabase.from("clinics").update(update).eq("id", member.clinicId);
    if (error) {
      console.error("save_guide_profile rejected:", error.code);
      return fail(SAVE_UNAVAILABLE);
    }

    await writeGuideStepCookie("sees_patients");
    revalidatePath(SETTINGS_PATH);
    return ok({ saved: true });
  } catch (error) {
    console.error("save_guide_profile failed:", error instanceof Error ? error.name : "unknown error");
    return fail(SAVE_UNAVAILABLE);
  }
}

export async function saveGuideSeesPatients(
  _previous: ActionResult<{ saved: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ saved: true }>> {
  const member = await requireOwner();
  const parsed = guideSeesPatientsSchema.safeParse({
    seesPatients: formData.get("seesPatients"),
  });
  if (!parsed.success) {
    return fail("Proverite unete podatke.", fieldErrorsFrom(parsed.error));
  }

  const seesPatients = parsed.data.seesPatients === "true";

  try {
    const supabase = await createSupabaseServerClient();
    const ownerMember = await loadOwnerMember(supabase, member.clinicId, member.userId);
    if (!ownerMember) {
      return fail(SAVE_UNAVAILABLE);
    }

    const { error: memberError } = await supabase
      .from("clinic_members")
      .update({ sees_patients: seesPatients })
      .eq("id", ownerMember.id);

    if (memberError) {
      console.error("save_guide_sees_patients member rejected:", memberError.code);
      return fail(SAVE_UNAVAILABLE);
    }

    if (!seesPatients) {
      const created = await ensureDefaultAppointmentType(supabase, member.clinicId);
      if (!created) {
        return fail(SAVE_UNAVAILABLE);
      }
    }

    const nextStep: GuideStep = seesPatients ? "working_hours" : "scheduling";
    await writeGuideStepCookie(nextStep);
    revalidatePath(SETTINGS_PATH);
    return ok({ saved: true });
  } catch (error) {
    console.error("save_guide_sees_patients failed:", error instanceof Error ? error.name : "unknown error");
    return fail(SAVE_UNAVAILABLE);
  }
}

export async function saveGuideWorkingHours(
  _previous: ActionResult<{ saved: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ saved: true }>> {
  const member = await requireOwner();
  const raw = readWorkingHoursForm(formData);
  const parsed = workingHoursSaveSchema.safeParse({
    memberId: raw.memberId,
    days: raw.days,
  });
  if (!parsed.success) {
    return fail("Proverite unete podatke.", fieldErrorsFrom(parsed.error));
  }

  try {
    const supabase = await createSupabaseServerClient();
    const ownerMember = await loadOwnerMember(supabase, member.clinicId, member.userId);
    if (!ownerMember || ownerMember.id !== parsed.data.memberId || !ownerMember.sees_patients) {
      return fail(SAVE_UNAVAILABLE);
    }

    const rows = parsed.data.days.map((day) => {
      if (day.isClosed) {
        return {
          clinic_id: member.clinicId,
          clinic_member_id: parsed.data.memberId,
          iso_dow: day.isoDow,
          is_closed: true,
          opens_at: null,
          closes_at: null,
          break_starts_at: null,
          break_ends_at: null,
        };
      }
      const breakStarts = day.breakStartsAt.length > 0 ? toDbTime(day.breakStartsAt) : null;
      const breakEnds = day.breakEndsAt.length > 0 ? toDbTime(day.breakEndsAt) : null;
      return {
        clinic_id: member.clinicId,
        clinic_member_id: parsed.data.memberId,
        iso_dow: day.isoDow,
        is_closed: false,
        opens_at: toDbTime(day.opensAt),
        closes_at: toDbTime(day.closesAt),
        break_starts_at: breakStarts,
        break_ends_at: breakEnds,
      };
    });

    const { error } = await supabase.from("working_hours").upsert(rows, {
      onConflict: "clinic_member_id,iso_dow",
    });
    if (error) {
      console.error("save_guide_working_hours rejected:", error.code);
      return fail(SAVE_UNAVAILABLE);
    }

    await writeGuideStepCookie("scheduling");
    revalidatePath(SETTINGS_PATH);
    return ok({ saved: true });
  } catch (error) {
    console.error("save_guide_working_hours failed:", error instanceof Error ? error.name : "unknown error");
    return fail(SAVE_UNAVAILABLE);
  }
}

export async function saveGuideScheduling(
  _previous: ActionResult<{ saved: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ saved: true }>> {
  const member = await requireOwner();
  const parsed = guideSchedulingSchema.safeParse({
    typeName: formData.get("typeName"),
    slotMinutes: formData.get("slotMinutes"),
    bufferMinutes: formData.get("bufferMinutes"),
    defaultDurationMin: formData.get("defaultDurationMin"),
  });
  if (!parsed.success) {
    return fail("Proverite unete podatke.", fieldErrorsFrom(parsed.error));
  }

  try {
    const supabase = await createSupabaseServerClient();
    const typeId = await ensureDefaultAppointmentType(supabase, member.clinicId, parsed.data.typeName);
    if (!typeId) {
      return fail(SAVE_UNAVAILABLE);
    }

    const { error: renameError } = await supabase
      .from("appointment_types")
      .update({ name: parsed.data.typeName })
      .eq("id", typeId);

    if (renameError) {
      console.error("save_guide_scheduling rename rejected:", renameError.code);
      return fail(SAVE_UNAVAILABLE);
    }

    const { error } = await supabase
      .from("clinics")
      .update({
        slot_minutes: parsed.data.slotMinutes,
        buffer_minutes: parsed.data.bufferMinutes,
        default_duration_min: parsed.data.defaultDurationMin,
        default_appointment_type_id: typeId,
      })
      .eq("id", member.clinicId);

    if (error) {
      console.error("save_guide_scheduling clinic rejected:", error.code);
      return fail(SAVE_UNAVAILABLE);
    }

    await writeGuideStepCookie("notice");
    revalidatePath(SETTINGS_PATH);
    return ok({ saved: true });
  } catch (error) {
    console.error("save_guide_scheduling failed:", error instanceof Error ? error.name : "unknown error");
    return fail(SAVE_UNAVAILABLE);
  }
}

export async function saveGuideNotice(
  _previous: ActionResult<{ saved: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ saved: true }>> {
  const member = await requireOwner();
  const parsed = guideNoticeSchema.safeParse({
    minNoticeMinutes: formData.get("minNoticeMinutes"),
    maxAheadDays: formData.get("maxAheadDays"),
  });
  if (!parsed.success) {
    return fail("Proverite unete podatke.", fieldErrorsFrom(parsed.error));
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("clinics")
      .update({
        min_notice_minutes: parsed.data.minNoticeMinutes,
        max_ahead_days: parsed.data.maxAheadDays,
      })
      .eq("id", member.clinicId);

    if (error) {
      console.error("save_guide_notice rejected:", error.code);
      return fail(SAVE_UNAVAILABLE);
    }

    await writeGuideStepCookie("invite");
    revalidatePath(SETTINGS_PATH);
    return ok({ saved: true });
  } catch (error) {
    console.error("save_guide_notice failed:", error instanceof Error ? error.name : "unknown error");
    return fail(SAVE_UNAVAILABLE);
  }
}

export async function advanceGuideInvite(
  _previous: ActionResult<{ saved: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ saved: true }>> {
  void formData;
  const member = await requireOwner();

  try {
    const supabase = await createSupabaseServerClient();
    const ownerMember = await loadOwnerMember(supabase, member.clinicId, member.userId);
    if (!ownerMember) {
      return fail(SAVE_UNAVAILABLE);
    }

    if (!ownerMember.sees_patients) {
      const hasInvite = await hasPendingDentistInvite(supabase, member.clinicId);
      if (!hasInvite) {
        return fail("Pozovite stomatologa pre nego što nastavite.");
      }
    }

    await writeGuideStepCookie("online");
    revalidatePath(SETTINGS_PATH);
    return ok({ saved: true });
  } catch (error) {
    console.error("advance_guide_invite failed:", error instanceof Error ? error.name : "unknown error");
    return fail(SAVE_UNAVAILABLE);
  }
}

export async function completeGuideSetup(
  _previous: ActionResult<{ saved: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ saved: true }>> {
  const member = await requireOwner();
  const parsed = guideOnlineSchema.safeParse({
    onlineBookingEnabled: formData.get("onlineBookingEnabled"),
  });
  if (!parsed.success) {
    return fail("Proverite unete podatke.", fieldErrorsFrom(parsed.error));
  }

  try {
    const supabase = await createSupabaseServerClient();
    const members = await supabase
      .from("clinic_members")
      .select("sees_patients")
      .eq("clinic_id", member.clinicId);

    if (members.error) {
      return fail(SAVE_UNAVAILABLE);
    }

    const someoneSeesPatients = (members.data ?? []).some((row) => row.sees_patients === true);
    if (!someoneSeesPatients) {
      return fail("Online zakazivanje je dostupno tek kada neko prima pacijente.");
    }

    const onlineBookingEnabled = parsed.data.onlineBookingEnabled === "true";
    const { error } = await supabase
      .from("clinics")
      .update({
        online_booking_enabled: onlineBookingEnabled,
        setup_completed_at: new Date().toISOString(),
      })
      .eq("id", member.clinicId)
      .is("setup_completed_at", null);

    if (error) {
      console.error("complete_guide_setup rejected:", error.code);
      return fail(SAVE_UNAVAILABLE);
    }

    await clearGuideStepCookie();
    revalidatePath(SETTINGS_PATH);
    redirect("/danas");
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    console.error("complete_guide_setup failed:", error instanceof Error ? error.name : "unknown error");
    return fail(SAVE_UNAVAILABLE);
  }
}

async function ensureDefaultAppointmentType(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  clinicId: string,
  name = DEFAULT_TYPE_NAME,
): Promise<string | null> {
  const existing = await supabase
    .from("appointment_types")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("active", true)
    .order("sort_order")
    .limit(1)
    .maybeSingle();

  if (existing.error) {
    console.error("ensure_default_type read failed:", existing.error.code);
    return null;
  }

  if (existing.data?.id) {
    const { error: defaultError } = await supabase
      .from("clinics")
      .update({ default_appointment_type_id: existing.data.id })
      .eq("id", clinicId)
      .is("default_appointment_type_id", null);
    if (defaultError) {
      console.error("ensure_default_type default failed:", defaultError.code);
      return null;
    }
    return existing.data.id;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("appointment_types")
    .insert({
      clinic_id: clinicId,
      name,
      sort_order: 0,
      active: true,
    })
    .select("id")
    .single();

  if (insertError || !inserted?.id) {
    console.error("ensure_default_type insert failed:", insertError?.code ?? "missing row");
    return null;
  }

  const { error: defaultError } = await supabase
    .from("clinics")
    .update({ default_appointment_type_id: inserted.id })
    .eq("id", clinicId);

  if (defaultError) {
    console.error("ensure_default_type set default failed:", defaultError.code);
    return null;
  }

  return inserted.id;
}

async function loadOwnerMember(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  clinicId: string,
  userId: string,
): Promise<{ id: string; sees_patients: boolean } | null> {
  const { data, error } = await supabase
    .from("clinic_members")
    .select("id, sees_patients")
    .eq("clinic_id", clinicId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data || typeof data.id !== "string") {
    return null;
  }
  return { id: data.id, sees_patients: data.sees_patients === true };
}

async function nextSlugForName(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  name: string,
  currentSlug: string,
): Promise<string | null> {
  const base = slugify(name, "clinic");
  if (base === currentSlug) {
    return null;
  }

  const { data, error } = await supabase.from("clinics").select("slug");
  if (error) {
    console.error("next_slug_for_name rejected:", error.code);
    return null;
  }

  const taken = (data ?? []).map((row) => row.slug).filter((slug): slug is string => typeof slug === "string");
  return allocateSlug(name, "clinic", taken.filter((slug) => slug !== currentSlug));
}

function fieldErrorsFrom(error: ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    (result[field] ??= []).push(issue.message);
  }
  return result;
}

async function hasPendingDentistInvite(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  clinicId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("staff_invites")
    .select("expires_at, role, used_at")
    .eq("clinic_id", clinicId)
    .is("used_at", null);

  if (error) {
    return false;
  }

  const now = Date.now();
  return (data ?? []).some((invite) => {
    if (invite.role !== "dentist") {
      return false;
    }
    const expiresAt = typeof invite.expires_at === "string" ? Date.parse(invite.expires_at) : 0;
    return expiresAt > now;
  });
}

function isRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: string }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}
