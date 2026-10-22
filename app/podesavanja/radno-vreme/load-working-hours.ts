import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { StaffRole } from "@/lib/auth";

import {
  defaultDaySchedule,
  ISO_DOW_ORDER,
  trimDbTime,
  type DayScheduleView,
  type IsoDow,
} from "./schema";

export type ScheduleDentist = {
  id: string;
  firstName: string;
  lastName: string;
};

export type WorkingHoursPageData =
  | {
      status: "ready";
      role: StaffRole;
      canPickDentist: boolean;
      dentists: ScheduleDentist[];
      selectedMemberId: string;
      days: DayScheduleView[];
    }
  | { status: "unavailable" }
  | { status: "no_dentists" };

export async function loadWorkingHoursPage(
  clinicId: string,
  userId: string,
  role: StaffRole,
  requestedMemberId: string | undefined,
): Promise<WorkingHoursPageData> {
  try {
    const supabase = await createSupabaseServerClient();
    const membersResult = await supabase
      .from("clinic_members")
      .select("id, user_id, first_name, last_name, sees_patients")
      .eq("clinic_id", clinicId)
      .eq("sees_patients", true)
      .order("first_name")
      .order("last_name");

    if (membersResult.error) {
      console.error("load_working_hours members rejected:", membersResult.error.code);
      return { status: "unavailable" };
    }

    const dentists = (membersResult.data ?? [])
      .map(parseDentistRow)
      .filter((row): row is ScheduleDentist => row !== null);

    if (dentists.length === 0) {
      return { status: "no_dentists" };
    }

    const ownMember = (membersResult.data ?? []).find((row) => row.user_id === userId);
    const ownMemberId = typeof ownMember?.id === "string" ? ownMember.id : null;

    if (role === "dentist") {
      if (!ownMemberId) {
        return { status: "unavailable" };
      }
      const days = await loadDaysForMember(supabase, clinicId, ownMemberId);
      return {
        status: "ready",
        role,
        canPickDentist: false,
        dentists,
        selectedMemberId: ownMemberId,
        days,
      };
    }

    const selectedMemberId = pickSelectedMember(dentists, requestedMemberId);
    const days = await loadDaysForMember(supabase, clinicId, selectedMemberId);
    return {
      status: "ready",
      role,
      canPickDentist: true,
      dentists,
      selectedMemberId,
      days,
    };
  } catch (error) {
    console.error("load_working_hours failed:", error instanceof Error ? error.name : "unknown error");
    return { status: "unavailable" };
  }
}

function pickSelectedMember(dentists: ScheduleDentist[], requestedMemberId: string | undefined): string {
  if (requestedMemberId && dentists.some((dentist) => dentist.id === requestedMemberId)) {
    return requestedMemberId;
  }
  return dentists[0].id;
}

async function loadDaysForMember(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  clinicId: string,
  memberId: string,
): Promise<DayScheduleView[]> {
  const { data, error } = await supabase
    .from("working_hours")
    .select("iso_dow, is_closed, opens_at, closes_at, break_starts_at, break_ends_at")
    .eq("clinic_id", clinicId)
    .eq("clinic_member_id", memberId);

  if (error) {
    console.error("load_working_hours rows rejected:", error.code);
    throw error;
  }

  const byDow = new Map<IsoDow, DayScheduleView>();
  for (const row of data ?? []) {
    const parsed = parseHoursRow(row);
    if (parsed) {
      byDow.set(parsed.isoDow, parsed);
    }
  }

  return ISO_DOW_ORDER.map((isoDow) => byDow.get(isoDow) ?? defaultDaySchedule(isoDow));
}

function parseDentistRow(row: Record<string, unknown>): ScheduleDentist | null {
  if (
    typeof row.id !== "string" ||
    typeof row.first_name !== "string" ||
    typeof row.last_name !== "string"
  ) {
    return null;
  }
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
  };
}

function parseHoursRow(row: Record<string, unknown>): DayScheduleView | null {
  const isoDow = row.iso_dow;
  if (typeof isoDow !== "number" || !ISO_DOW_ORDER.includes(isoDow as IsoDow)) {
    return null;
  }
  if (typeof row.is_closed !== "boolean") {
    return null;
  }
  if (row.is_closed) {
    return {
      isoDow: isoDow as IsoDow,
      isClosed: true,
      opensAt: "",
      closesAt: "",
      breakStartsAt: "",
      breakEndsAt: "",
    };
  }
  if (typeof row.opens_at !== "string" || typeof row.closes_at !== "string") {
    return null;
  }
  return {
    isoDow: isoDow as IsoDow,
    isClosed: false,
    opensAt: trimDbTime(row.opens_at),
    closesAt: trimDbTime(row.closes_at),
    breakStartsAt: trimDbTime(typeof row.break_starts_at === "string" ? row.break_starts_at : null),
    breakEndsAt: trimDbTime(typeof row.break_ends_at === "string" ? row.break_ends_at : null),
  };
}
