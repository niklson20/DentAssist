import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import {
  DUPLICATE_CONFIRMATION_REQUIRED,
  needsDuplicateNameConfirmation,
  newPatientFormSchema,
  parseDuplicateConfirmation,
  patientMatchesSearch,
  patientSearchQuerySchema,
} from "@/app/pacijenti/search-schema";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireMember } from "@/lib/auth";
import { allocateSlug } from "@/lib/slug";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PatientListItem = {
  id: string;
  firstName: string;
  lastName: string;
  slug: string;
  phone: string | null;
};

type PatientRow = {
  id: string;
  first_name: string;
  last_name: string;
  slug: string;
  phone: string | null;
};

export async function searchClinicPatients(clinicId: string, query: string): Promise<PatientListItem[]> {
  const parsed = patientSearchQuerySchema.safeParse({ pretraga: query });
  const term = parsed.success ? (parsed.data.pretraga ?? "").trim() : "";
  if (!term) {
    return [];
  }

  const supabase = await createSupabaseServerClient();
  const pattern = `%${escapeIlike(term)}%`;
  const { data, error } = await supabase
    .from("patients")
    .select("id, first_name, last_name, slug, phone")
    .eq("clinic_id", clinicId)
    .is("merged_into_id", null)
    .or(`first_name.ilike.${pattern},last_name.ilike.${pattern},phone.ilike.${pattern}`)
    .order("last_name")
    .order("first_name")
    .limit(50);

  if (error) {
    console.error("search_clinic_patients rejected:", error.code);
    return [];
  }

  const rows = (data ?? []).map(mapPatientRow);
  return rows.filter((row) => patientMatchesSearch(row, term));
}

export async function listClinicPatientNames(
  clinicId: string,
  firstName: string,
  lastName: string,
): Promise<readonly { firstName: string; lastName: string }[]> {
  const supabase = await createSupabaseServerClient();
  const patternFirst = `%${escapeIlike(firstName.trim())}%`;
  const patternLast = `%${escapeIlike(lastName.trim())}%`;
  const { data, error } = await supabase
    .from("patients")
    .select("first_name, last_name")
    .eq("clinic_id", clinicId)
    .is("merged_into_id", null)
    .ilike("first_name", patternFirst)
    .ilike("last_name", patternLast)
    .limit(20);

  if (error) {
    console.error("list_clinic_patient_names rejected:", error.code);
    return [];
  }

  return (data ?? []).map((row) => ({
    firstName: row.first_name,
    lastName: row.last_name,
  }));
}

export async function createClinicPatient(
  clinicId: string,
  input: {
    firstName: string;
    lastName: string;
    phone: string | null;
    duplicateConfirmed: boolean;
  },
): Promise<ActionResult<{ slug: string }>> {
  const parsed = newPatientFormSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string") {
        fieldErrors[key] = [issue.message];
      }
    }
    return fail("Proverite unos.", fieldErrors);
  }

  const draft = parsed.data;
  const existing = await listClinicPatientNames(clinicId, draft.firstName, draft.lastName);
  const needsConfirm = needsDuplicateNameConfirmation(existing, draft.firstName, draft.lastName);
  if (needsConfirm && !draft.duplicateConfirmed) {
    return fail(DUPLICATE_CONFIRMATION_REQUIRED, {
      duplicateConfirmed: [DUPLICATE_CONFIRMATION_REQUIRED],
    });
  }

  const supabase = await createSupabaseServerClient();
  const slug = await allocatePatientSlug(supabase, clinicId, draft.firstName, draft.lastName);
  if (!slug) {
    return fail("Karton trenutno nije dostupan. Pokušajte ponovo.");
  }

  const inserted = await supabase
    .from("patients")
    .insert({
      clinic_id: clinicId,
      first_name: draft.firstName,
      last_name: draft.lastName,
      slug,
      phone: draft.phone,
    })
    .select("slug")
    .single();

  if (inserted.error || !inserted.data?.slug) {
    console.error("create_clinic_patient rejected:", inserted.error?.code ?? "empty");
    return fail("Karton trenutno nije dostupan. Pokušajte ponovo.");
  }

  return ok({ slug: inserted.data.slug });
}

async function allocatePatientSlug(
  supabase: SupabaseClient,
  clinicId: string,
  firstName: string,
  lastName: string,
): Promise<string | null> {
  const { data, error } = await supabase.from("patients").select("slug").eq("clinic_id", clinicId);
  if (error) {
    console.error("allocate_patient_slug rejected:", error.code);
    return null;
  }
  const taken = (data ?? []).map((row) => row.slug).filter((value): value is string => typeof value === "string");
  return allocateSlug(`${firstName} ${lastName}`, "patient", taken);
}

function mapPatientRow(row: PatientRow): PatientListItem {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    slug: row.slug,
    phone: row.phone,
  };
}

function escapeIlike(term: string): string {
  return term.replace(/[%_\\]/g, (char) => `\\${char}`);
}

export async function createPatientFromList(formData: FormData): Promise<void> {
  "use server";

  const member = await requireMember();
  const firstName = String(formData.get("firstName") ?? "");
  const lastName = String(formData.get("lastName") ?? "");
  const phoneRaw = String(formData.get("phone") ?? "");
  const phone = phoneRaw.trim().length > 0 ? phoneRaw : null;
  const duplicateConfirmed = parseDuplicateConfirmation(formData.get("duplicateConfirmed"));

  const result = await createClinicPatient(member.clinicId, {
    firstName,
    lastName,
    phone,
    duplicateConfirmed,
  });

  if (!result.ok) {
    if (result.error === DUPLICATE_CONFIRMATION_REQUIRED) {
      const params = new URLSearchParams({
        potvrdiIme: "1",
        ime: firstName,
        prezime: lastName,
        telefon: phoneRaw,
      });
      redirect(`/pacijenti?${params.toString()}`);
    }
    const params = new URLSearchParams({
      ime: firstName,
      prezime: lastName,
      telefon: phoneRaw,
      greska: result.error,
    });
    redirect(`/pacijenti?${params.toString()}`);
  }

  redirect(`/pacijenti/${result.data.slug}`);
}
