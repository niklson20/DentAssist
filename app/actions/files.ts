"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z, type ZodError } from "zod";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireMember, type MemberSession } from "@/lib/auth";
import { formatBelgradeDate, isDocumentLocked, isIsoDate } from "@/lib/calendar-dates";
import { FILE_CATEGORIES, type FileCategory } from "@/lib/labels";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const BUCKET = "patient-files";
const MAX_FILE_BYTES = 10485760;
const SIGNED_URL_SECONDS = 60;
const OBJECT_PATH =
  /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/i;

const CHECK = "Proverite unete podatke.";
const UNAVAILABLE = "Čuvanje trenutno nije moguće. Pokušajte ponovo.";
const HIDDEN = "Dokumenti nisu dostupni.";
const CHART_MISSING = "Karton nije pronađen.";
const FILE_MISSING = "Dokument nije pronađen.";
const LOCKED = "Dokument je zaključan.";
const IMMUTABLE = "Sadržaj fajla se ne zamenjuje.";
const SPACE = "Nema dovoljno prostora za ovaj fajl.";
const TITLE_REQUIRED = "Unesite naslov.";
const TITLE_MAX = "Naslov može imati najviše 200 znakova.";
const CATEGORY_REQUIRED = "Izaberite kategoriju.";
const DATE_REQUIRED = "Unesite datum snimanja.";
const FUTURE = "Datum snimanja ne može biti u budućnosti.";
const FILE_REQUIRED = "Izaberite fajl.";
const FILE_TOO_BIG = "Fajl može imati najviše 10 MB.";
const MIME_INVALID = "Dozvoljeni formati su JPEG, PNG, WebP i PDF.";
const PICK_FILE = "Izaberite dokument.";

const FILE_MIMES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
type FileMime = (typeof FILE_MIMES)[number];

const EXTENSIONS: Record<FileMime, "jpg" | "png" | "webp" | "pdf"> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export type PatientDocument = {
  id: string;
  title: string;
  category: FileCategory;
  capturedOn: string;
  createdAt: string;
  mimeType: FileMime;
  sizeBytes: number;
};

export type PreparedUpload = {
  fileId: string;
  path: string;
  uploadUrl: string;
  clinicId: string;
};

type StoredFile = PatientDocument & {
  patientId: string;
  storagePath: string;
};

type WriteError = {
  code?: string;
  message?: string;
  status?: number;
  statusCode?: string | number;
};

const metadataSchema = z.object({
  title: z.string().trim().min(1, TITLE_REQUIRED).max(200, TITLE_MAX),
  category: z.enum(FILE_CATEGORIES, { error: CATEGORY_REQUIRED }),
  capturedOn: z.string().trim().refine((value) => isIsoDate(value), DATE_REQUIRED),
});

const uploadSchema = metadataSchema.extend({
  patientId: z.string().trim().uuid(CHART_MISSING),
  mimeType: z.enum(FILE_MIMES, { error: MIME_INVALID }),
  sizeBytes: z.number({ error: FILE_REQUIRED }).int().min(1, FILE_REQUIRED).max(MAX_FILE_BYTES, FILE_TOO_BIG),
});

const confirmSchema = uploadSchema.extend({
  fileId: z.string().trim().uuid(PICK_FILE),
});

const updateSchema = metadataSchema.extend({
  fileId: z.string().trim().uuid(PICK_FILE),
});

const fileIdSchema = z.object({
  fileId: z.string().trim().uuid(PICK_FILE),
});

const openSchema = fileIdSchema.extend({
  intent: z.enum(["preview", "download"], { error: PICK_FILE }),
});

const patientIdSchema = z.string().trim().uuid(CHART_MISSING);

export async function preparePatientFileUpload(
  _previous: ActionResult<PreparedUpload> | null,
  formData: FormData,
): Promise<ActionResult<PreparedUpload>> {
  const member = await requireClinical();
  if (!member) return fail(HIDDEN);

  const parsed = uploadSchema.safeParse(readUpload(formData));
  if (!parsed.success) return fail(CHECK, fieldErrorsFrom(parsed.error));
  const future = futureDate(parsed.data.capturedOn);
  if (future) return future;

  try {
    const supabase = await createSupabaseServerClient();
    const chart = await findOpenChart(supabase, member.clinicId, parsed.data.patientId);
    if (chart === "missing") return fail(CHART_MISSING);
    if (chart === "unavailable") return fail(UNAVAILABLE);

    const fileId = crypto.randomUUID();
    const path = objectPath(member.clinicId, parsed.data.patientId, fileId, parsed.data.mimeType);
    if (!pathAllowed(path, member.clinicId)) return fail(UNAVAILABLE);

    const signed = await supabase.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: false });
    if (signed.error || !signed.data) {
      console.error("prepare_patient_file rejected:", errorCode(signed.error));
      return fail(storageRefusal(signed.error) ?? UNAVAILABLE);
    }
    if (!signedUrlAllowed(signed.data.signedUrl, member.clinicId, fileId) || signed.data.path !== path) {
      return fail(UNAVAILABLE);
    }

    return ok({
      fileId,
      path,
      uploadUrl: signed.data.signedUrl,
      clinicId: member.clinicId,
    });
  } catch (error) {
    console.error("prepare_patient_file failed:", error instanceof Error ? error.name : "unknown");
    return fail(UNAVAILABLE);
  }
}

export async function confirmPatientFile(
  _previous: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const member = await requireClinical();
  if (!member) return fail(HIDDEN);

  const parsed = confirmSchema.safeParse({
    ...readUpload(formData),
    fileId: text(formData.get("fileId")),
  });
  if (!parsed.success) return fail(CHECK, fieldErrorsFrom(parsed.error));
  const future = futureDate(parsed.data.capturedOn);
  if (future) return future;

  const path = objectPath(member.clinicId, parsed.data.patientId, parsed.data.fileId, parsed.data.mimeType);
  if (!pathAllowed(path, member.clinicId)) return fail(UNAVAILABLE);

  try {
    const supabase = await createSupabaseServerClient();
    const chart = await findOpenChart(supabase, member.clinicId, parsed.data.patientId);
    if (chart === "missing") return fail(CHART_MISSING);
    if (chart === "unavailable") return fail(UNAVAILABLE);

    const saved = await supabase.from("patient_files").insert({
      id: parsed.data.fileId,
      patient_id: parsed.data.patientId,
      clinic_id: member.clinicId,
      title: parsed.data.title,
      category: parsed.data.category,
      captured_on: parsed.data.capturedOn,
      storage_path: path,
      mime_type: parsed.data.mimeType,
      size_bytes: parsed.data.sizeBytes,
    });
    if (saved.error) {
      console.error("confirm_patient_file rejected:", errorCode(saved.error));
      return fail(failureMessage(saved.error));
    }

    revalidatePath("/danas");
    revalidatePath("/pacijenti", "layout");
    return ok({ id: parsed.data.fileId });
  } catch (error) {
    console.error("confirm_patient_file failed:", error instanceof Error ? error.name : "unknown");
    return fail(UNAVAILABLE);
  }
}

export async function updatePatientFile(
  _previous: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const member = await requireClinical();
  if (!member) return fail(HIDDEN);

  const parsed = updateSchema.safeParse({
    fileId: text(formData.get("fileId")),
    title: text(formData.get("title")),
    category: text(formData.get("category")),
    capturedOn: text(formData.get("capturedOn")),
  });
  if (!parsed.success) return fail(CHECK, fieldErrorsFrom(parsed.error));
  const future = futureDate(parsed.data.capturedOn);
  if (future) return future;

  try {
    const supabase = await createSupabaseServerClient();
    const stored = await loadFile(supabase, member.clinicId, parsed.data.fileId);
    if (stored === "missing") return fail(FILE_MISSING);
    if (stored === "unavailable") return fail(UNAVAILABLE);
    if (!pathAllowed(stored.storagePath, member.clinicId)) return fail(UNAVAILABLE);
    if (isLocked(stored.createdAt, new Date())) return fail(LOCKED);

    const saved = await supabase
      .from("patient_files")
      .update({
        title: parsed.data.title,
        category: parsed.data.category,
        captured_on: parsed.data.capturedOn,
      })
      .eq("clinic_id", member.clinicId)
      .eq("id", parsed.data.fileId);
    if (saved.error) {
      console.error("update_patient_file rejected:", errorCode(saved.error));
      return fail(failureMessage(saved.error));
    }

    revalidatePath("/danas");
    revalidatePath("/pacijenti", "layout");
    return ok({ id: parsed.data.fileId });
  } catch (error) {
    console.error("update_patient_file failed:", error instanceof Error ? error.name : "unknown");
    return fail(UNAVAILABLE);
  }
}

export async function deletePatientFile(
  _previous: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const member = await requireClinical();
  if (!member) return fail(HIDDEN);

  const parsed = fileIdSchema.safeParse({ fileId: text(formData.get("fileId")) });
  if (!parsed.success) return fail(CHECK, fieldErrorsFrom(parsed.error));

  try {
    const supabase = await createSupabaseServerClient();
    const stored = await loadFile(supabase, member.clinicId, parsed.data.fileId);
    if (stored === "missing") return fail(FILE_MISSING);
    if (stored === "unavailable") return fail(UNAVAILABLE);
    if (!pathAllowed(stored.storagePath, member.clinicId)) return fail(UNAVAILABLE);
    if (isLocked(stored.createdAt, new Date())) return fail(LOCKED);

    const removed = await supabase
      .from("patient_files")
      .delete()
      .eq("clinic_id", member.clinicId)
      .eq("id", parsed.data.fileId);
    if (removed.error) {
      console.error("delete_patient_file rejected:", errorCode(removed.error));
      return fail(failureMessage(removed.error));
    }

    const objectRemoved = await supabase.storage.from(BUCKET).remove([stored.storagePath]);
    if (objectRemoved.error) {
      console.error("delete_patient_file storage rejected:", errorCode(objectRemoved.error));
    }

    revalidatePath("/danas");
    revalidatePath("/pacijenti", "layout");
    return ok({ id: parsed.data.fileId });
  } catch (error) {
    console.error("delete_patient_file failed:", error instanceof Error ? error.name : "unknown");
    return fail(UNAVAILABLE);
  }
}

export async function openPatientFile(
  _previous: ActionResult<{ url: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  const member = await requireClinical();
  if (!member) return fail(HIDDEN);

  const parsed = openSchema.safeParse({
    fileId: text(formData.get("fileId")),
    intent: text(formData.get("intent")),
  });
  if (!parsed.success) return fail(CHECK, fieldErrorsFrom(parsed.error));

  try {
    const supabase = await createSupabaseServerClient();
    const stored = await loadFile(supabase, member.clinicId, parsed.data.fileId);
    if (stored === "missing") return fail(FILE_MISSING);
    if (stored === "unavailable") return fail(UNAVAILABLE);
    if (!pathAllowed(stored.storagePath, member.clinicId)) return fail(UNAVAILABLE);

    const signed =
      parsed.data.intent === "download"
        ? await supabase.storage.from(BUCKET).createSignedUrl(stored.storagePath, SIGNED_URL_SECONDS, {
            download: true,
          })
        : await supabase.storage.from(BUCKET).createSignedUrl(stored.storagePath, SIGNED_URL_SECONDS);
    if (signed.error || !signed.data) {
      console.error("open_patient_file rejected:", errorCode(signed.error));
      return fail(UNAVAILABLE);
    }
    if (!signedUrlAllowed(signed.data.signedUrl, member.clinicId, stored.id)) return fail(UNAVAILABLE);

    return ok({ url: signed.data.signedUrl });
  } catch (error) {
    console.error("open_patient_file failed:", error instanceof Error ? error.name : "unknown");
    return fail(UNAVAILABLE);
  }
}

export async function listPatientFiles(
  patientId: string,
): Promise<ActionResult<{ documents: PatientDocument[] }>> {
  const member = await requireClinical();
  if (!member) return fail(HIDDEN);

  const parsed = patientIdSchema.safeParse(patientId);
  if (!parsed.success) return fail(CHART_MISSING);

  try {
    const supabase = await createSupabaseServerClient();
    const chart = await findOpenChart(supabase, member.clinicId, parsed.data);
    if (chart === "missing") return fail(CHART_MISSING);
    if (chart === "unavailable") return fail(UNAVAILABLE);

    const result = await supabase
      .from("patient_files")
      .select("id, patient_id, title, category, captured_on, storage_path, mime_type, size_bytes, created_at")
      .eq("clinic_id", member.clinicId)
      .eq("patient_id", parsed.data);
    if (result.error) {
      console.error("list_patient_files rejected:", errorCode(result.error));
      return fail(UNAVAILABLE);
    }

    const documents: PatientDocument[] = [];
    for (const row of rowsFrom(result.data)) {
      const stored = fileFrom(row);
      if (!stored || stored.patientId !== parsed.data || !pathAllowed(stored.storagePath, member.clinicId)) {
        continue;
      }
      documents.push(toDocument(stored));
    }
    documents.sort(byNewest);
    return ok({ documents });
  } catch (error) {
    console.error("list_patient_files failed:", error instanceof Error ? error.name : "unknown");
    return fail(UNAVAILABLE);
  }
}

async function requireClinical(): Promise<MemberSession | null> {
  const member = await requireMember();
  if (member.role !== "owner" && member.role !== "dentist") return null;
  return member;
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
    console.error("patient_file_chart rejected:", errorCode(result.error));
    return "unavailable";
  }
  const id = chartId(result.data);
  return id === patientId ? "found" : "missing";
}

async function loadFile(
  supabase: SupabaseClient,
  clinicId: string,
  fileId: string,
): Promise<StoredFile | "missing" | "unavailable"> {
  const result = await supabase
    .from("patient_files")
    .select("id, patient_id, title, category, captured_on, storage_path, mime_type, size_bytes, created_at")
    .eq("clinic_id", clinicId)
    .eq("id", fileId)
    .maybeSingle();
  if (result.error) {
    console.error("patient_file_read rejected:", errorCode(result.error));
    return "unavailable";
  }
  if (!result.data) return "missing";
  return fileFrom(result.data) ?? "unavailable";
}

function toDocument(stored: StoredFile): PatientDocument {
  return {
    id: stored.id,
    title: stored.title,
    category: stored.category,
    capturedOn: stored.capturedOn,
    createdAt: stored.createdAt,
    mimeType: stored.mimeType,
    sizeBytes: stored.sizeBytes,
  };
}

function fileFrom(data: unknown): StoredFile | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.patient_id !== "string" ||
    typeof row.title !== "string" ||
    typeof row.storage_path !== "string" ||
    typeof row.created_at !== "string" ||
    typeof row.captured_on !== "string" ||
    !isIsoDate(row.captured_on) ||
    !isFileCategory(row.category) ||
    !isFileMime(row.mime_type) ||
    typeof row.size_bytes !== "number"
  ) {
    return null;
  }
  return {
    id: row.id,
    patientId: row.patient_id,
    title: row.title,
    category: row.category,
    capturedOn: row.captured_on,
    createdAt: row.created_at,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    storagePath: row.storage_path,
  };
}

function objectPath(clinicId: string, patientId: string, fileId: string, mime: FileMime): string {
  return `${clinicId}/${patientId}/${fileId}.${EXTENSIONS[mime]}`;
}

function pathAllowed(value: string, clinicId: string): boolean {
  return value.startsWith(`${clinicId}/`) && OBJECT_PATH.test(value);
}

function signedUrlAllowed(value: string, clinicId: string, fileId: string): boolean {
  return isHttpUrl(value) && value.includes(clinicId) && value.includes(fileId);
}

function isHttpUrl(value: string): boolean {
  return value.startsWith("https://") || value.startsWith("http://");
}

function isLocked(createdAt: string, now: Date): boolean {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return true;
  return isDocumentLocked(created, now);
}

function futureDate(capturedOn: string): ActionResult<never> | null {
  if (capturedOn > formatBelgradeDate(new Date())) {
    return fail(CHECK, { capturedOn: [FUTURE] });
  }
  return null;
}

function byNewest(left: PatientDocument, right: PatientDocument): number {
  const byCapture = right.capturedOn.localeCompare(left.capturedOn);
  if (byCapture !== 0) return byCapture;
  return right.createdAt.localeCompare(left.createdAt);
}

function rowsFrom(data: unknown): unknown[] {
  return Array.isArray(data) ? data : [];
}

function chartId(data: unknown): string | null {
  if (!data || typeof data !== "object" || !("id" in data)) return null;
  return typeof data.id === "string" ? data.id : null;
}

function isFileCategory(value: unknown): value is FileCategory {
  return typeof value === "string" && (FILE_CATEGORIES as readonly string[]).includes(value);
}

function isFileMime(value: unknown): value is FileMime {
  return typeof value === "string" && (FILE_MIMES as readonly string[]).includes(value);
}

function readUpload(formData: FormData) {
  return {
    patientId: text(formData.get("patientId")),
    title: text(formData.get("title")),
    category: text(formData.get("category")),
    capturedOn: text(formData.get("capturedOn")),
    mimeType: text(formData.get("mimeType")),
    sizeBytes: parseSize(text(formData.get("sizeBytes"))) ?? -1,
  };
}

function parseSize(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const size = Number(value);
  return Number.isSafeInteger(size) ? size : null;
}

function storageRefusal(error: WriteError | null): string | null {
  if (!error) return null;
  const status = typeof error.status === "number" ? error.status : Number(error.statusCode);
  const message = (error.message ?? "").toLowerCase();
  if (
    status === 413 ||
    status === 507 ||
    message.includes("quota") ||
    message.includes("exceeded") ||
    message.includes("payload too large")
  ) {
    return SPACE;
  }
  return null;
}

function failureMessage(error: WriteError): string {
  const message = error.message ?? "";
  if (message.includes("patient file is locked")) return LOCKED;
  if (message.includes("patient file content is immutable")) return IMMUTABLE;
  if (message.includes("patient file mime is not allowed")) return MIME_INVALID;
  return storageRefusal(error) ?? UNAVAILABLE;
}

function errorCode(error: WriteError | null): string | number {
  return error?.code ?? error?.status ?? "rejected";
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
