import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LegalDataView = {
  taxId: string;
  registrationNumber: string;
  licenseNumber: string;
};

export type LegalDataPageData =
  | { status: "ready"; fields: LegalDataView }
  | { status: "unavailable" };

type LegalRow = {
  tax_id: string | null;
  registration_number: string | null;
  license_number: string | null;
};

export async function loadLegalDataPage(clinicId: string): Promise<LegalDataPageData> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("clinic_legal_fields", {
      target_clinic_id: clinicId,
    });

    if (error) {
      console.error("load_legal_data rpc failed:", error.code);
      return { status: "unavailable" };
    }

    const row = pickLegalRow(data);
    if (!row) {
      return { status: "unavailable" };
    }

    return {
      status: "ready",
      fields: {
        taxId: row.tax_id ?? "",
        registrationNumber: row.registration_number ?? "",
        licenseNumber: row.license_number ?? "",
      },
    };
  } catch (error) {
    console.error(
      "load_legal_data failed:",
      error instanceof Error ? error.name : "unknown error",
    );
    return { status: "unavailable" };
  }
}

function pickLegalRow(data: unknown): LegalRow | null {
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }
  const row = data[0];
  if (!row || typeof row !== "object") {
    return null;
  }
  const record = row as Record<string, unknown>;
  return {
    tax_id: typeof record.tax_id === "string" || record.tax_id === null ? record.tax_id : null,
    registration_number:
      typeof record.registration_number === "string" || record.registration_number === null
        ? record.registration_number
        : null,
    license_number:
      typeof record.license_number === "string" || record.license_number === null
        ? record.license_number
        : null,
  };
}
