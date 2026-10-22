import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AppointmentTypeView = {
  id: string;
  name: string;
  sortOrder: number;
  active: boolean;
};

export type AppointmentTypesPageData =
  | {
      status: "ready";
      types: AppointmentTypeView[];
      defaultTypeId: string | null;
    }
  | { status: "unavailable" };

export async function loadAppointmentTypesPage(clinicId: string): Promise<AppointmentTypesPageData> {
  try {
    const supabase = await createSupabaseServerClient();
    const [typesResult, clinicResult] = await Promise.all([
      supabase
        .from("appointment_types")
        .select("id, name, sort_order, active")
        .eq("clinic_id", clinicId)
        .order("sort_order")
        .order("name"),
      supabase.from("clinics").select("default_appointment_type_id").eq("id", clinicId).maybeSingle(),
    ]);

    if (typesResult.error || clinicResult.error) {
      console.error(
        "load_appointment_types_page rejected:",
        typesResult.error?.code ?? clinicResult.error?.code ?? "unknown",
      );
      return { status: "unavailable" };
    }

    const types = (typesResult.data ?? [])
      .map(parseTypeRow)
      .filter((row): row is AppointmentTypeView => row !== null);

    const defaultRaw = clinicResult.data?.default_appointment_type_id;
    const defaultTypeId = typeof defaultRaw === "string" ? defaultRaw : null;

    return { status: "ready", types, defaultTypeId };
  } catch (error) {
    console.error(
      "load_appointment_types_page failed:",
      error instanceof Error ? error.name : "unknown error",
    );
    return { status: "unavailable" };
  }
}

function parseTypeRow(row: Record<string, unknown>): AppointmentTypeView | null {
  if (
    typeof row.id !== "string" ||
    typeof row.name !== "string" ||
    typeof row.sort_order !== "number" ||
    typeof row.active !== "boolean"
  ) {
    return null;
  }
  const name = row.name.trim();
  if (!name) {
    return null;
  }
  return {
    id: row.id,
    name,
    sortOrder: row.sort_order,
    active: row.active,
  };
}
