"use server";

import { revalidatePath } from "next/cache";
import type { ZodError } from "zod";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireMember } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  readWorkingHoursForm,
  toDbTime,
  workingHoursSaveSchema,
} from "./schema";

const WORKING_HOURS_PATH = "/podesavanja/radno-vreme";
const SAVE_UNAVAILABLE = "Čuvanje trenutno nije moguće. Pokušajte ponovo.";

export async function saveWorkingHours(
  _previous: ActionResult<{ saved: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ saved: true }>> {
  const member = await requireMember();
  if (member.role === "reception") {
    return fail(SAVE_UNAVAILABLE);
  }

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
    const allowed = await canEditMemberSchedule(supabase, member, parsed.data.memberId);
    if (!allowed) {
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
      console.error("save_working_hours rejected:", error.code);
      return fail(SAVE_UNAVAILABLE);
    }

    revalidatePath(WORKING_HOURS_PATH);
    return ok({ saved: true });
  } catch (error) {
    console.error("save_working_hours failed:", error instanceof Error ? error.name : "unknown error");
    return fail(SAVE_UNAVAILABLE);
  }
}

async function canEditMemberSchedule(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  member: Awaited<ReturnType<typeof requireMember>>,
  targetMemberId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("clinic_members")
    .select("id, user_id, sees_patients")
    .eq("clinic_id", member.clinicId)
    .eq("id", targetMemberId)
    .maybeSingle();

  if (error || !data || data.sees_patients !== true) {
    return false;
  }

  if (member.role === "owner") {
    return true;
  }

  return data.user_id === member.userId;
}

function fieldErrorsFrom(error: ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!key) {
      continue;
    }
    const mapped = mapFieldKey(key);
    if (!fieldErrors[mapped]) {
      fieldErrors[mapped] = [];
    }
    fieldErrors[mapped].push(issue.message);
  }
  return fieldErrors;
}

function mapFieldKey(path: string): string {
  const dayMatch = /^days\.(\d+)\.(.+)$/.exec(path);
  if (!dayMatch) {
    return path === "memberId" ? "memberId" : path;
  }
  const index = Number(dayMatch[1]);
  const field = dayMatch[2];
  const isoDow = index + 1;
  if (field === "opensAt") {
    return `opens_${isoDow}`;
  }
  if (field === "closesAt") {
    return `closes_${isoDow}`;
  }
  if (field === "breakStartsAt") {
    return `breakStart_${isoDow}`;
  }
  if (field === "breakEndsAt") {
    return `breakEnd_${isoDow}`;
  }
  return path;
}
