import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readGuideStepCookie } from "./guide-cookie";
import {
  deriveGuideStep,
  guideStepIndex,
  resolveGuideStep,
  type GuideProgressSnapshot,
  type GuideStep,
} from "./steps";

export type GuideClinicView = {
  name: string;
  city: string;
  address: string;
  phone: string;
  slotMinutes: 15 | 30;
  bufferMinutes: 0 | 5 | 10 | 15;
  defaultDurationMin: number;
  minNoticeMinutes: number;
  maxAheadDays: number;
  defaultTypeName: string;
};

export type GuideLoadResult =
  | { status: "complete" }
  | {
      status: "ready";
      step: GuideStep;
      ownerMemberId: string;
      ownerSeesPatients: boolean;
      ownerPinSet: boolean;
      someoneSeesPatients: boolean;
      clinic: GuideClinicView;
      pendingDentistInvite: boolean;
    }
  | { status: "unavailable" };

export async function loadGuide(clinicId: string, userId: string): Promise<GuideLoadResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const [clinicResult, membersResult, typesResult, invitesResult, pinResult, cookieStep] =
      await Promise.all([
        supabase
          .from("clinics")
          .select(
            "setup_completed_at, terms_accepted_at, name, city, address, phone, slot_minutes, buffer_minutes, default_duration_min, min_notice_minutes, max_ahead_days, default_appointment_type_id",
          )
          .eq("id", clinicId)
          .maybeSingle(),
        supabase
          .from("clinic_members")
          .select("id, user_id, sees_patients")
          .eq("clinic_id", clinicId),
        supabase
          .from("appointment_types")
          .select("id, name")
          .eq("clinic_id", clinicId)
          .eq("active", true)
          .order("sort_order")
          .limit(1),
        supabase
          .from("staff_invites")
          .select("id, role, used_at, expires_at")
          .eq("clinic_id", clinicId)
          .is("used_at", null),
        supabase.rpc("own_pin_is_set"),
        readGuideStepCookie(),
      ]);

    if (clinicResult.error || !clinicResult.data) {
      return { status: "unavailable" };
    }

    const clinic = clinicResult.data;
    if (clinic.setup_completed_at) {
      return { status: "complete" };
    }

    const owner = (membersResult.data ?? []).find((row) => row.user_id === userId);
    if (!owner || typeof owner.id !== "string") {
      return { status: "unavailable" };
    }

    const ownerSeesPatients = owner.sees_patients === true;
    const someoneSeesPatients = (membersResult.data ?? []).some((row) => row.sees_patients === true);
    const appointmentTypeCount = typesResult.data?.length ?? 0;
    const defaultTypeName =
      typeof typesResult.data?.[0]?.name === "string" ? typesResult.data[0].name : "Pregled";

    const workingHours = await supabase
      .from("working_hours")
      .select("id")
      .eq("clinic_id", clinicId)
      .eq("clinic_member_id", owner.id)
      .limit(1);

    const ownerWorkingHoursSaved = (workingHours.data?.length ?? 0) > 0;
    const now = Date.now();
    const pendingDentistInvite = (invitesResult.data ?? []).some((invite) => {
      if (invite.role !== "dentist") {
        return false;
      }
      const expiresAt = typeof invite.expires_at === "string" ? Date.parse(invite.expires_at) : 0;
      return expiresAt > now;
    });
    const hasDentistMember = (membersResult.data ?? []).some(
      (row) => row.user_id !== userId && row.sees_patients === true,
    );

    const cookieIndex = cookieStep ? guideStepIndex(cookieStep) : -1;
    const progress: GuideProgressSnapshot = {
      termsAccepted: clinic.terms_accepted_at !== null,
      profileComplete: hasProfile(clinic.address, clinic.phone),
      seesPatientsChosen: ownerSeesPatients || appointmentTypeCount > 0,
      ownerSeesPatients,
      ownerWorkingHoursSaved,
      schedulingSaved: cookieIndex >= guideStepIndex("notice"),
      noticeSaved: cookieIndex >= guideStepIndex("invite"),
      inviteSatisfied: ownerSeesPatients || pendingDentistInvite || hasDentistMember,
    };

    const step = resolveGuideStep(progress, cookieStep);

    const phone = typeof clinic.phone === "string" ? clinic.phone : "";

    return {
      status: "ready",
      step,
      ownerMemberId: owner.id,
      ownerSeesPatients,
      ownerPinSet: pinResult.data === true,
      someoneSeesPatients,
      pendingDentistInvite,
      clinic: {
        name: clinic.name,
        city: clinic.city,
        address: typeof clinic.address === "string" ? clinic.address : "",
        phone,
        slotMinutes: clinic.slot_minutes as 15 | 30,
        bufferMinutes: clinic.buffer_minutes as 0 | 5 | 10 | 15,
        defaultDurationMin: clinic.default_duration_min,
        minNoticeMinutes: clinic.min_notice_minutes,
        maxAheadDays: clinic.max_ahead_days,
        defaultTypeName,
      },
    };
  } catch (error) {
    console.error("load_guide failed:", error instanceof Error ? error.name : "unknown error");
    return { status: "unavailable" };
  }
}

function hasProfile(address: string | null, phone: string | null): boolean {
  return Boolean(address?.trim() && phone?.trim());
}

export function buildProgressForTests(
  partial: Partial<GuideProgressSnapshot>,
): GuideProgressSnapshot {
  return {
    termsAccepted: false,
    profileComplete: false,
    seesPatientsChosen: false,
    ownerSeesPatients: false,
    ownerWorkingHoursSaved: false,
    schedulingSaved: false,
    noticeSaved: false,
    inviteSatisfied: false,
    ...partial,
  };
}

export { deriveGuideStep, resolveGuideStep };
