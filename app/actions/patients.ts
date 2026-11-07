"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z, type ZodError } from "zod";

import { parsePatientJmbg } from "@/app/pacijenti/new-patient-schema";
import {
  chartDetailsSchema,
  DUPLICATE_CONFIRMATION_REQUIRED,
  needsDuplicateNameConfirmation,
  normalizePatientSearchTerm,
} from "@/app/pacijenti/search-schema";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireMember } from "@/lib/auth";
import { formatBelgradeDate, isIsoDate, needsPatientEmailTask } from "@/lib/calendar-dates";
import { ALERT_CODES } from "@/lib/labels";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const CHECK = "Proverite unete podatke.";
const UNAVAILABLE = "Čuvanje trenutno nije moguće. Pokušajte ponovo.";
const CHART_MISSING = "Karton nije pronađen.";
const EMAIL_SET = "Mejl je već upisan.";
const EMAIL_TAKEN = "U ordinaciji već postoji pacijent sa tim mejlom.";
const ANAMNESIS_HIDDEN = "Anamneza nije dostupna.";
const ALERT_HIDDEN = "Upozorenje nije dostupno.";
const MERGE_HIDDEN = "Spajanje nije dostupno.";
const PICK_CHART = "Izaberite karton.";
const OTHER_CHART = "Izaberite drugi karton.";
const PICK_CODE = "Izaberite šifru.";
const NOTE_REQUIRED = "Unesite kratak tekst.";
const NOTE_MAX = "Tekst može imati najviše 500 znakova.";
const TEXT_MAX = "Tekst može imati najviše 4000 znakova.";

const longText = z.string().trim().max(4000, TEXT_MAX);

const anamnesisSchema = z.object({
  patientId: z.string({ error: PICK_CHART }).trim().uuid(PICK_CHART),
  chronicConditions: longText,
  medications: longText,
  allergies: longText,
  pregnancy: longText,
});

const alertSchema = z.object({
  patientId: z.string({ error: PICK_CHART }).trim().uuid(PICK_CHART),
  code: z.enum(ALERT_CODES, { error: PICK_CODE }),
  note: z.string().trim().min(1, NOTE_REQUIRED).max(500, NOTE_MAX),
});

const PATIENT_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const mergeSchema = z.object({
  patientId: z.string({ error: PICK_CHART }).trim().uuid(PICK_CHART),
  sourceId: z.string({ error: PICK_CHART }).trim().uuid(PICK_CHART),
});

const dismissEmailSchema = z.object({
  patientSlug: z.string({ error: PICK_CHART }).trim().toLowerCase().regex(PATIENT_SLUG, PICK_CHART),
});

export async function saveAnamnesis(
  _previous: ActionResult<{ patientId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ patientId: string }>> {
  const member = await requireMember();
  if (member.role === "reception") {
    return fail(ANAMNESIS_HIDDEN);
  }

  const parsed = anamnesisSchema.safeParse({
    patientId: text(formData.get("patientId")),
    chronicConditions: text(formData.get("chronicConditions")),
    medications: text(formData.get("medications")),
    allergies: text(formData.get("allergies")),
    pregnancy: text(formData.get("pregnancy")),
  });
  if (!parsed.success) {
    return fail(CHECK, fieldErrorsFrom(parsed.error));
  }

  try {
    const supabase = await createSupabaseServerClient();
    const chart = await findOpenChart(supabase, member.clinicId, parsed.data.patientId);
    if (chart === "missing") return fail(CHART_MISSING);
    if (chart === "unavailable") return fail(UNAVAILABLE);

    const saved = await supabase.from("patient_anamnesis").upsert(
      {
        patient_id: parsed.data.patientId,
        clinic_id: member.clinicId,
        chronic_conditions: emptyToNull(parsed.data.chronicConditions),
        medications: emptyToNull(parsed.data.medications),
        allergies: emptyToNull(parsed.data.allergies),
        pregnancy: emptyToNull(parsed.data.pregnancy),
      },
      { onConflict: "patient_id" },
    );
    if (saved.error) {
      console.error("save_anamnesis rejected:", saved.error.code ?? "rejected");
      return fail(UNAVAILABLE);
    }

    revalidatePath("/danas");
    revalidatePath("/zahtevi");
    revalidatePath("/pacijenti", "layout");
    return ok({ patientId: parsed.data.patientId });
  } catch (error) {
    console.error("save_anamnesis failed:", error instanceof Error ? error.name : "unknown");
    return fail(UNAVAILABLE);
  }
}

export async function saveAlert(
  _previous: ActionResult<{ patientId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ patientId: string }>> {
  const member = await requireMember();
  if (member.role === "reception") {
    return fail(ALERT_HIDDEN);
  }

  const parsed = alertSchema.safeParse({
    patientId: text(formData.get("patientId")),
    code: text(formData.get("code")),
    note: text(formData.get("note")),
  });
  if (!parsed.success) {
    return fail(CHECK, fieldErrorsFrom(parsed.error));
  }

  try {
    const supabase = await createSupabaseServerClient();
    const chart = await findOpenChart(supabase, member.clinicId, parsed.data.patientId);
    if (chart === "missing") return fail(CHART_MISSING);
    if (chart === "unavailable") return fail(UNAVAILABLE);

    const saved = await supabase.from("patient_alerts").insert({
      patient_id: parsed.data.patientId,
      clinic_id: member.clinicId,
      code: parsed.data.code,
      note: parsed.data.note,
    });
    if (saved.error) {
      console.error("save_alert rejected:", saved.error.code ?? "rejected");
      return fail(UNAVAILABLE);
    }

    revalidatePath("/danas");
    revalidatePath("/zahtevi");
    revalidatePath("/pacijenti", "layout");
    return ok({ patientId: parsed.data.patientId });
  } catch (error) {
    console.error("save_alert failed:", error instanceof Error ? error.name : "unknown");
    return fail(UNAVAILABLE);
  }
}

export async function mergeCharts(
  _previous: ActionResult<{ patientId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ patientId: string }>> {
  const member = await requireMember();
  if (member.role !== "owner") {
    return fail(MERGE_HIDDEN);
  }

  const parsed = mergeSchema.safeParse({
    patientId: text(formData.get("patientId")),
    sourceId: text(formData.get("sourceId")),
  });
  if (!parsed.success) {
    return fail(CHECK, fieldErrorsFrom(parsed.error));
  }
  if (parsed.data.patientId === parsed.data.sourceId) {
    return fail(CHECK, { sourceId: [OTHER_CHART] });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const target = await findOpenChart(supabase, member.clinicId, parsed.data.patientId);
    if (target === "missing") return fail(CHART_MISSING);
    if (target === "unavailable") return fail(UNAVAILABLE);

    const source = await findOpenChart(supabase, member.clinicId, parsed.data.sourceId);
    if (source === "missing") return fail(CHART_MISSING);
    if (source === "unavailable") return fail(UNAVAILABLE);

    const merged = await supabase.rpc("merge_patients", {
      target_id: parsed.data.patientId,
      source_id: parsed.data.sourceId,
    });
    if (merged.error) {
      console.error("merge_charts rejected:", merged.error.code ?? "rejected");
      return fail(UNAVAILABLE);
    }

    revalidatePath("/danas");
    revalidatePath("/zahtevi");
    revalidatePath("/pacijenti", "layout");
    return ok({ patientId: parsed.data.patientId });
  } catch (error) {
    console.error("merge_charts failed:", error instanceof Error ? error.name : "unknown");
    return fail(UNAVAILABLE);
  }
}

export async function dismissPatientEmail(
  _previous: ActionResult<{ patientSlug: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ patientSlug: string }>> {
  const member = await requireMember();
  const parsed = dismissEmailSchema.safeParse({
    patientSlug: text(formData.get("patientSlug")),
  });
  if (!parsed.success) {
    return fail(CHECK, fieldErrorsFrom(parsed.error));
  }

  try {
    const supabase = await createSupabaseServerClient();
    const found = await supabase
      .from("patients")
      .select("id, email, email_declined")
      .eq("clinic_id", member.clinicId)
      .eq("slug", parsed.data.patientSlug)
      .is("merged_into_id", null)
      .maybeSingle();

    if (found.error) {
      console.error("dismiss_patient_email rejected:", found.error.code ?? "rejected");
      return fail(UNAVAILABLE);
    }

    const patient = patientEmailState(found.data);
    if (!patient) return fail(CHART_MISSING);
    if (patient.email) return fail(EMAIL_SET);
    if (patient.emailDeclined) return ok({ patientSlug: parsed.data.patientSlug });

    const saved = await supabase
      .from("patients")
      .update({ email_declined: true })
      .eq("clinic_id", member.clinicId)
      .eq("id", patient.id)
      .is("email", null)
      .select("id")
      .maybeSingle();

    if (saved.error) {
      console.error("dismiss_patient_email rejected:", saved.error.code ?? "rejected");
      return fail(UNAVAILABLE);
    }
    if (chartId(saved.data) !== patient.id) return fail(UNAVAILABLE);

    revalidatePath("/danas");
    revalidatePath("/zahtevi");
    revalidatePath("/pacijenti", "layout");
    revalidatePath(`/pacijenti/${parsed.data.patientSlug}`);
    return ok({ patientSlug: parsed.data.patientSlug });
  } catch (error) {
    console.error("dismiss_patient_email failed:", error instanceof Error ? error.name : "unknown");
    return fail(UNAVAILABLE);
  }
}

export async function saveChartDetails(
  _previous: ActionResult<{ patientSlug: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ patientSlug: string }>> {
  const member = await requireMember();
  const slug = text(formData.get("patientSlug")).trim().toLowerCase();
  if (!PATIENT_SLUG.test(slug)) return fail(CHART_MISSING);

  const clinical = member.role === "owner" || member.role === "dentist";
  const parsed = chartDetailsSchema(formatBelgradeDate(new Date())).safeParse({
    firstName: text(formData.get("firstName")),
    lastName: text(formData.get("lastName")),
    phone: text(formData.get("phone")),
    dateOfBirth: text(formData.get("dateOfBirth")),
    sex: text(formData.get("sex")),
    email: text(formData.get("email")),
    address: text(formData.get("address")),
    note: text(formData.get("note")),
    duplicateConfirmed: parseDuplicateFlag(formData.get("duplicateConfirmed")),
  });
  const jmbg = clinical ? parsePatientJmbg(text(formData.get("jmbg"))) : { ok: true as const, jmbg: null };
  if (!parsed.success || !jmbg.ok) {
    const fieldErrors = parsed.success ? {} : fieldErrorsFrom(parsed.error);
    if (!jmbg.ok) fieldErrors.jmbg = [jmbg.message];
    return fail(CHECK, fieldErrors);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const found = await supabase
      .from("patients")
      .select("id, first_name, last_name, email")
      .eq("clinic_id", member.clinicId)
      .eq("slug", slug)
      .is("merged_into_id", null)
      .maybeSingle();
    if (found.error) {
      console.error("save_chart_details rejected:", found.error.code ?? "rejected");
      return fail(UNAVAILABLE);
    }
    const current = chartIdentity(found.data);
    if (!current) return fail(CHART_MISSING);

    const nameChanged =
      normalizePatientSearchTerm(current.firstName) !== normalizePatientSearchTerm(parsed.data.firstName) ||
      normalizePatientSearchTerm(current.lastName) !== normalizePatientSearchTerm(parsed.data.lastName);
    if (nameChanged && !parsed.data.duplicateConfirmed) {
      const names = await supabase
        .from("patients")
        .select("id, first_name, last_name")
        .eq("clinic_id", member.clinicId)
        .is("merged_into_id", null)
        .ilike("first_name", `%${escapeIlike(parsed.data.firstName)}%`)
        .ilike("last_name", `%${escapeIlike(parsed.data.lastName)}%`)
        .limit(20);
      if (names.error) {
        console.error("save_chart_details names rejected:", names.error.code ?? "rejected");
        return fail(UNAVAILABLE);
      }
      const others = chartNameRows(names.data).filter((row) => row.id !== current.id);
      if (needsDuplicateNameConfirmation(others, parsed.data.firstName, parsed.data.lastName)) {
        return fail(DUPLICATE_CONFIRMATION_REQUIRED, {
          duplicateConfirmed: [DUPLICATE_CONFIRMATION_REQUIRED],
        });
      }
    }

    if (parsed.data.email && parsed.data.email !== current.email) {
      const taken = await supabase
        .from("patients")
        .select("id")
        .eq("clinic_id", member.clinicId)
        .ilike("email", escapeIlike(parsed.data.email))
        .limit(20);
      if (taken.error) {
        console.error("save_chart_details email rejected:", taken.error.code ?? "rejected");
        return fail(UNAVAILABLE);
      }
      const clash = chartIds(taken.data).some((id) => id !== current.id);
      if (clash) return fail(CHECK, { email: [EMAIL_TAKEN] });
    }

    const patch: {
      first_name: string;
      last_name: string;
      phone: string | null;
      email: string | null;
      email_declined?: boolean;
      date_of_birth: string | null;
      sex: "male" | "female" | null;
      address: string | null;
      note: string | null;
      jmbg?: string | null;
    } = {
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      phone: parsed.data.phone,
      email: parsed.data.email,
      date_of_birth: parsed.data.dateOfBirth,
      sex: parsed.data.sex,
      address: parsed.data.address,
      note: parsed.data.note,
    };
    if (parsed.data.email) patch.email_declined = false;
    if (clinical) patch.jmbg = jmbg.jmbg;

    const saved = await supabase
      .from("patients")
      .update(patch)
      .eq("clinic_id", member.clinicId)
      .eq("id", current.id)
      .is("merged_into_id", null)
      .select("id")
      .maybeSingle();
    if (saved.error) {
      const code = saved.error.code ?? "rejected";
      const detail = `${saved.error.message ?? ""} ${saved.error.details ?? ""}`.toLowerCase();
      if (code === "23505" && detail.includes("email")) {
        return fail(CHECK, { email: [EMAIL_TAKEN] });
      }
      console.error("save_chart_details rejected:", code);
      return fail(UNAVAILABLE);
    }
    if (chartId(saved.data) !== current.id) return fail(UNAVAILABLE);

    revalidatePath("/danas");
    revalidatePath("/zahtevi");
    revalidatePath("/pacijenti", "layout");
    revalidatePath(`/pacijenti/${slug}`);
    return ok({ patientSlug: slug });
  } catch (error) {
    console.error("save_chart_details failed:", error instanceof Error ? error.name : "unknown");
    return fail(UNAVAILABLE);
  }
}

function parseDuplicateFlag(value: FormDataEntryValue | null): boolean {
  return value === "da" || value === "on" || value === "true";
}

function escapeIlike(term: string): string {
  return term.replace(/[%_\\]/g, (char) => `\\${char}`);
}

function chartIdentity(data: unknown): { id: string; firstName: string; lastName: string; email: string | null } | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.first_name !== "string" || typeof record.last_name !== "string") {
    return null;
  }
  const firstName = record.first_name.trim();
  const lastName = record.last_name.trim();
  if (!firstName || !lastName) return null;
  const email = typeof record.email === "string" && record.email.trim() ? record.email.trim().toLowerCase() : null;
  return { id: record.id, firstName, lastName, email };
}

function chartIds(data: unknown): string[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const id = (row as Record<string, unknown>).id;
    return typeof id === "string" ? [id] : [];
  });
}

function chartNameRows(data: unknown): { id: string; firstName: string; lastName: string }[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((row) => {
    const identity = chartIdentity(row);
    return identity ? [identity] : [];
  });
}

async function findOpenChart(
  supabase: SupabaseClient,
  clinicId: string,
  patientId: string,
): Promise<"found" | "missing" | "unavailable"> {
  const result = await supabase
    .from("patients")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("id", patientId)
    .is("merged_into_id", null)
    .maybeSingle();

  if (result.error) {
    console.error("save_patient_chart rejected:", result.error.code ?? "rejected");
    return "unavailable";
  }

  const id = chartId(result.data);
  return id === patientId ? "found" : "missing";
}

function chartId(data: unknown): string | null {
  if (!data || typeof data !== "object" || !("id" in data)) {
    return null;
  }
  return typeof data.id === "string" ? data.id : null;
}

function emptyToNull(value: string): string | null {
  return value.length > 0 ? value : null;
}

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function fieldErrorsFrom(error: ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    (result[field] ??= []).push(issue.message);
  }
  return result;
}

type PatientEmailChart = {
  slug: string;
  firstName: string;
  lastName: string;
  hasContact: boolean;
  dateOfBirth: string | null;
  email: string | null;
  emailDeclined: boolean;
};

export async function loadPatientEmailCharts(onDate: string, slug?: string): Promise<PatientEmailChart[]> {
  const member = await requireMember();
  const safeSlug = typeof slug === "string" ? slug.trim().toLowerCase() : undefined;
  if (!isIsoDate(onDate) || (safeSlug !== undefined && !PATIENT_SLUG.test(safeSlug))) {
    return [];
  }

  try {
    const supabase = await createSupabaseServerClient();
    const patientsQuery = supabase
      .from("patients")
      .select("id, slug, first_name, last_name, email, date_of_birth, email_declined")
      .eq("clinic_id", member.clinicId)
      .is("merged_into_id", null);
    const patientsResult = safeSlug ? await patientsQuery.eq("slug", safeSlug) : await patientsQuery;
    if (patientsResult.error) {
      console.error("load_patient_email_charts rejected:", patientsResult.error.code ?? "rejected");
      return [];
    }

    const rows = Array.isArray(patientsResult.data) ? patientsResult.data : [];
    const ids = rows.flatMap((row) => {
      const id = chartId(row);
      return id ? [id] : [];
    });
    const contactIds = await contactIdsFor(supabase, member.clinicId, ids);
    if (contactIds === null) return [];

    const due = rows.flatMap((row) => {
      const patient = emailChartFrom(row, contactIds);
      if (!patient || !patientEmailTaskDue(patient, onDate)) return [];
      return [patient];
    });
    due.sort((left, right) => {
      const byLastName = left.lastName.localeCompare(right.lastName, "sr");
      return byLastName === 0 ? left.firstName.localeCompare(right.firstName, "sr") : byLastName;
    });
    return due;
  } catch (error) {
    console.error("load_patient_email_charts failed:", error instanceof Error ? error.name : "unknown");
    return [];
  }
}

async function contactIdsFor(
  supabase: SupabaseClient,
  clinicId: string,
  patientIds: string[],
): Promise<Set<string> | null> {
  if (patientIds.length === 0) return new Set();
  const contactsResult = await supabase
    .from("patient_contacts")
    .select("patient_id")
    .eq("clinic_id", clinicId)
    .in("patient_id", patientIds);
  if (contactsResult.error) {
    console.error("load_patient_email_charts contacts rejected:", contactsResult.error.code ?? "rejected");
    return null;
  }
  const ids = new Set<string>();
  if (!Array.isArray(contactsResult.data)) return ids;
  for (const row of contactsResult.data) {
    if (!row || typeof row !== "object") continue;
    const patientId = (row as Record<string, unknown>).patient_id;
    if (typeof patientId === "string") ids.add(patientId);
  }
  return ids;
}

function emailChartFrom(row: unknown, contactIds: ReadonlySet<string>): PatientEmailChart | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.slug !== "string" || !PATIENT_SLUG.test(record.slug)) {
    return null;
  }
  if (typeof record.first_name !== "string" || typeof record.last_name !== "string") return null;
  const firstName = record.first_name.trim();
  const lastName = record.last_name.trim();
  if (!firstName || !lastName) return null;
  const dateText = typeof record.date_of_birth === "string" ? record.date_of_birth.slice(0, 10) : "";
  return {
    slug: record.slug,
    firstName,
    lastName,
    hasContact: contactIds.has(record.id),
    dateOfBirth: isIsoDate(dateText) ? dateText : null,
    email: typeof record.email === "string" && record.email.trim() ? record.email.trim() : null,
    emailDeclined: record.email_declined === true,
  };
}

function patientEmailTaskDue(patient: PatientEmailChart, onDate: string): boolean {
  try {
    return needsPatientEmailTask({
      hasContact: patient.hasContact,
      dateOfBirth: patient.dateOfBirth,
      email: patient.email,
      emailDeclined: patient.emailDeclined,
      onDate,
    });
  } catch {
    return false;
  }
}

function patientEmailState(data: unknown): { id: string; email: string | null; emailDeclined: boolean } | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (typeof record.id !== "string") return null;
  return {
    id: record.id,
    email: typeof record.email === "string" && record.email.trim() ? record.email.trim() : null,
    emailDeclined: record.email_declined === true,
  };
}
