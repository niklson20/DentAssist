import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { parsePatientJmbg } from "@/app/pacijenti/new-patient-schema";
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
import { formatBelgradeDate } from "@/lib/calendar-dates";
import { allocateSlug } from "@/lib/slug";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const EMAIL_TAKEN = "U ordinaciji već postoji pacijent sa tim mejlom.";
const CHECK_ENTRY = "Proverite unos.";

export const PATIENT_PAGE_SIZE = 20;

export type PatientListItem = {
  id: string;
  firstName: string;
  lastName: string;
  slug: string;
  phone: string | null;
  dateOfBirth: string | null;
};

export type PatientListPage = {
  patients: PatientListItem[];
  total: number;
  page: number;
};

type PatientRow = {
  id: string;
  first_name: string;
  last_name: string;
  slug: string;
  phone: string | null;
  date_of_birth: string | null;
};

export async function searchClinicPatients(
  clinicId: string,
  query: string,
  page = 1,
): Promise<PatientListPage> {
  const parsed = patientSearchQuerySchema.safeParse({ pretraga: query });
  const term = parsed.success ? (parsed.data.pretraga ?? "").trim() : "";
  const requested = Number.isInteger(page) && page > 0 ? page : 1;
  const from = (requested - 1) * PATIENT_PAGE_SIZE;
  const to = from + PATIENT_PAGE_SIZE - 1;

  const supabase = await createSupabaseServerClient();
  let request = supabase
    .from("patients")
    .select("id, first_name, last_name, slug, phone, date_of_birth", { count: "exact" })
    .eq("clinic_id", clinicId)
    .is("merged_into_id", null)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true })
    .order("id", { ascending: true });

  if (term) {
    const pattern = `%${escapeIlike(term)}%`;
    request = request.or(
      `first_name.ilike.${pattern},last_name.ilike.${pattern},phone.ilike.${pattern}`,
    );
  }

  const { data, error, count } = await request.range(from, to);

  if (error) {
    console.error("search_clinic_patients rejected:", error.code);
    return { patients: [], total: 0, page: requested };
  }

  const rows = (data ?? []).map(mapPatientRow);
  return {
    patients: term ? rows.filter((row) => patientMatchesSearch(row, term)) : rows,
    total: count ?? rows.length,
    page: requested,
  };
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
    phone: string;
    dateOfBirth: string;
    sex: string;
    email: string;
    address: string;
    note: string;
    jmbg: string | null;
    duplicateConfirmed: boolean;
  },
  today = formatBelgradeDate(new Date()),
): Promise<ActionResult<{ slug: string }>> {
  const parsed = newPatientFormSchema(today).safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string") {
        fieldErrors[key] = [issue.message];
      }
    }
    return fail(CHECK_ENTRY, fieldErrors);
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
  if (draft.email) {
    const taken = await supabase
      .from("patients")
      .select("id")
      .eq("clinic_id", clinicId)
      .ilike("email", escapeIlike(draft.email))
      .limit(1);
    if (taken.error) {
      console.error("create_clinic_patient email lookup rejected:", taken.error.code);
      return fail("Karton trenutno nije dostupan. Pokušajte ponovo.");
    }
    if ((taken.data ?? []).length > 0) {
      return fail(CHECK_ENTRY, { email: [EMAIL_TAKEN] });
    }
  }

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
      email: draft.email,
      date_of_birth: draft.dateOfBirth,
      sex: draft.sex,
      address: draft.address,
      note: draft.note,
      jmbg: input.jmbg,
    })
    .select("slug")
    .single();

  if (inserted.error || !inserted.data?.slug) {
    const code = inserted.error?.code ?? "empty";
    const detail = `${inserted.error?.message ?? ""} ${inserted.error?.details ?? ""}`.toLowerCase();
    if (code === "23505" && detail.includes("email")) {
      return fail(CHECK_ENTRY, { email: [EMAIL_TAKEN] });
    }
    console.error("create_clinic_patient rejected:", code);
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
    dateOfBirth: row.date_of_birth,
  };
}

function escapeIlike(term: string): string {
  return term.replace(/[%_\\]/g, (char) => `\\${char}`);
}

export async function createPatientFromList(
  _previous: ActionResult<{ slug: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ slug: string }>> {
  "use server";

  const member = await requireMember();
  const clinical = member.role === "owner" || member.role === "dentist";
  const jmbg = clinical ? parsePatientJmbg(String(formData.get("jmbg") ?? "")) : { ok: true as const, jmbg: null };
  if (!jmbg.ok) {
    return fail(CHECK_ENTRY, { jmbg: [jmbg.message] });
  }

  const result = await createClinicPatient(member.clinicId, {
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    dateOfBirth: String(formData.get("dateOfBirth") ?? ""),
    sex: String(formData.get("sex") ?? ""),
    email: String(formData.get("email") ?? ""),
    address: String(formData.get("address") ?? ""),
    note: String(formData.get("note") ?? ""),
    jmbg: jmbg.jmbg,
    duplicateConfirmed: parseDuplicateConfirmation(formData.get("duplicateConfirmed")),
  });

  if (!result.ok) {
    return result;
  }

  redirect(`/pacijenti/${result.data.slug}`);
}
