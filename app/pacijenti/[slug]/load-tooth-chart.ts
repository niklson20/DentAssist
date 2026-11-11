import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  actorLabelForMember,
  toothChartFromRows,
  type ToothChart,
  type ToothChangeRow,
  type ToothMemberRow,
  type ToothStateRow,
} from "./tooth-chart";

export async function loadCurrentMemberActor(clinicId: string, userId: string): Promise<string> {
  const supabase = await createSupabaseServerClient();
  return readCurrentMemberActor(supabase, clinicId, userId);
}

export async function readCurrentMemberActor(
  supabase: SupabaseClient,
  clinicId: string,
  userId: string,
): Promise<string> {
  const result = await supabase
    .from("clinic_members")
    .select("id, role, first_name, last_name")
    .eq("clinic_id", clinicId)
    .eq("user_id", userId)
    .maybeSingle();
  if (result.error) {
    console.error("read_current_member_actor rejected:", result.error.code ?? "rejected");
    return "—";
  }
  if (!result.data) {
    return "—";
  }
  return actorLabelForMember(result.data as ToothMemberRow);
}

export async function readToothChart(
  supabase: SupabaseClient,
  clinicId: string,
  patientId: string,
): Promise<ToothChart | null> {
  const statesResult = await supabase
    .from("tooth_states")
    .select("id, fdi_code, status, surfaces")
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId);

  if (statesResult.error) {
    console.error("read_tooth_chart states rejected:", statesResult.error.code ?? "rejected");
    return null;
  }

  const states = (statesResult.data ?? []) as ToothStateRow[];
  const stateIds = states.map((row) => row.id).filter((id) => typeof id === "string");

  let changes: ToothChangeRow[] = [];
  if (stateIds.length > 0) {
    const changesResult = await supabase
      .from("tooth_state_changes")
      .select(
        "id, tooth_state_id, old_status, new_status, old_surfaces, new_surfaces, changed_by, changed_at",
      )
      .eq("clinic_id", clinicId)
      .in("tooth_state_id", stateIds)
      .order("changed_at", { ascending: false });

    if (changesResult.error) {
      console.error("read_tooth_chart changes rejected:", changesResult.error.code ?? "rejected");
      return null;
    }
    changes = (changesResult.data ?? []) as ToothChangeRow[];
  }

  const memberIds = [
    ...new Set(
      changes
        .map((row) => row.changed_by)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];

  let members: ToothMemberRow[] = [];
  if (memberIds.length > 0) {
    const membersResult = await supabase
      .from("clinic_members")
      .select("id, role, first_name, last_name")
      .eq("clinic_id", clinicId)
      .in("id", memberIds);

    if (membersResult.error) {
      console.error("read_tooth_chart members rejected:", membersResult.error.code ?? "rejected");
      return null;
    }
    members = (membersResult.data ?? []) as ToothMemberRow[];
  }

  return toothChartFromRows(states, changes, members);
}
