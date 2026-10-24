import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseBelgradeLocal } from "@/lib/calendar-dates";

const mocks = vi.hoisted(() => ({
  requireMember: vi.fn(),
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireMember: mocks.requireMember }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createClient,
}));

import {
  confirmPatientFile,
  deletePatientFile,
  listPatientFiles,
  openPatientFile,
  preparePatientFileUpload,
  updatePatientFile,
} from "./files";

const clinicId = "11111111-1111-4111-8111-111111111111";
const otherClinicId = "99999999-9999-4999-8999-999999999999";
const patientId = "22222222-2222-4222-8222-222222222222";
const fileId = "33333333-3333-4333-8333-333333333333";
const userId = "10000000-0000-4000-8000-000000000002";
const DAY = "2026-06-08";
const createdAt = parseBelgradeLocal(`${DAY}T10:00`);
const storagePath = `${clinicId}/${patientId}/${fileId}.jpg`;

type FileRow = {
  id: string;
  patient_id: string;
  clinic_id: string;
  title: string;
  category: string;
  captured_on: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

type SignCall =
  | { bucket: string; op: "upload"; path: string; upsert: boolean }
  | { bucket: string; op: "read"; path: string; expiresIn: number; download: boolean }
  | { bucket: string; op: "remove"; paths: string[] };

const state: {
  patients: { id: string; clinic_id: string }[];
  files: FileRow[];
  signCalls: SignCall[];
  updatePayloads: Record<string, unknown>[];
  removedPaths: string[];
  byteUploads: number;
  uploadError: { status?: number; message?: string } | null;
} = {
  patients: [],
  files: [],
  signCalls: [],
  updatePayloads: [],
  removedPaths: [],
  byteUploads: 0,
  uploadError: null,
};

function uploadForm(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  const values = {
    patientId,
    title: "Snimak",
    category: "xray",
    capturedOn: DAY,
    mimeType: "image/jpeg",
    sizeBytes: "10485760",
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function confirmForm(id: string, overrides: Record<string, string> = {}): FormData {
  const data = uploadForm(overrides);
  data.set("fileId", id);
  return data;
}

function editForm(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  const values = {
    fileId,
    title: "Snimak",
    category: "xray",
    capturedOn: DAY,
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function viewForm(intent = "preview"): FormData {
  const data = new FormData();
  data.set("fileId", fileId);
  data.set("intent", intent);
  return data;
}

function deleteForm(): FormData {
  const data = new FormData();
  data.set("fileId", fileId);
  return data;
}

function seedFile(pathValue = storagePath): void {
  state.files = [
    {
      id: fileId,
      patient_id: patientId,
      clinic_id: clinicId,
      title: "Snimak",
      category: "xray",
      captured_on: DAY,
      storage_path: pathValue,
      mime_type: "image/jpeg",
      size_bytes: 1200,
      created_at: createdAt.toISOString(),
    },
  ];
}

function matches(row: FileRow, filters: Map<string, unknown>): boolean {
  if (filters.has("id") && row.id !== filters.get("id")) return false;
  if (filters.has("clinic_id") && row.clinic_id !== filters.get("clinic_id")) return false;
  if (filters.has("patient_id") && row.patient_id !== filters.get("patient_id")) return false;
  return true;
}

function createMemory() {
  function from(table: string) {
    const filters = new Map<string, unknown>();
    let mode: "select" | "insert" | "update" | "delete" = "select";
    let payload: Record<string, unknown> | null = null;

    const run = () => {
      if (table === "patients") {
        const row = state.patients.find(
          (item) => item.id === filters.get("id") && item.clinic_id === filters.get("clinic_id"),
        );
        return { data: row ? { id: row.id } : null, error: null };
      }
      if (table !== "patient_files") throw new Error(`unexpected table ${table}`);

      const rows = state.files.filter((item) => matches(item, filters));
      if (mode === "insert") {
        const row = payload as Omit<FileRow, "created_at"> & { created_at?: string };
        if (state.files.some((item) => item.id === row.id)) {
          return { data: null, error: { code: "23505", message: "duplicate" } };
        }
        state.files.push({
          created_at: new Date().toISOString(),
          ...row,
        });
        return { data: { id: row.id }, error: null };
      }
      if (mode === "update") {
        const row = rows[0];
        if (!row || !payload) return { data: null, error: { code: "PGRST116", message: "missing" } };
        state.updatePayloads.push({ ...payload });
        Object.assign(row, payload);
        return { data: null, error: null };
      }
      if (mode === "delete") {
        const row = rows[0];
        if (!row) return { data: null, error: { code: "PGRST116", message: "missing" } };
        state.files = state.files.filter((item) => item.id !== row.id);
        return { data: null, error: null };
      }
      return { data: rows.map((item) => ({ ...item })), error: null };
    };

    const builder = {
      select() {
        return builder;
      },
      insert(row: Record<string, unknown>) {
        mode = "insert";
        payload = row;
        return builder;
      },
      update(row: Record<string, unknown>) {
        mode = "update";
        payload = row;
        return builder;
      },
      delete() {
        mode = "delete";
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.set(column, value);
        return builder;
      },
      is() {
        return builder;
      },
      order() {
        return builder;
      },
      maybeSingle() {
        const result = run();
        if (result.error) return Promise.resolve({ data: null, error: result.error });
        if (Array.isArray(result.data)) {
          return Promise.resolve({ data: result.data[0] ?? null, error: null });
        }
        return Promise.resolve(result);
      },
      then(
        onFulfilled: (value: { data: unknown; error: unknown }) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        return Promise.resolve(run()).then(onFulfilled, onRejected);
      },
    };
    return builder;
  }

  return {
    from,
    storage: {
      from(bucket: string) {
        if (bucket !== "patient-files") throw new Error(`unexpected bucket ${bucket}`);
        return {
          createSignedUploadUrl(objectPath: string, options?: { upsert?: boolean }) {
            state.signCalls.push({
              bucket,
              op: "upload",
              path: objectPath,
              upsert: options?.upsert === true,
            });
            if (state.uploadError) return Promise.resolve({ data: null, error: state.uploadError });
            return Promise.resolve({
              data: {
                signedUrl: `https://storage.example/upload/${objectPath}?token=t`,
                token: "t",
                path: objectPath,
              },
              error: null,
            });
          },
          createSignedUrl(objectPath: string, expiresIn: number, options?: { download?: string | boolean }) {
            state.signCalls.push({
              bucket,
              op: "read",
              path: objectPath,
              expiresIn,
              download: Boolean(options?.download),
            });
            return Promise.resolve({
              data: { signedUrl: `https://storage.example/sign/${objectPath}` },
              error: null,
            });
          },
          upload() {
            state.byteUploads += 1;
            return Promise.resolve({ data: null, error: { message: "content upload is not allowed" } });
          },
          update() {
            state.byteUploads += 1;
            return Promise.resolve({ data: null, error: { message: "content replace is not allowed" } });
          },
          remove(paths: string[]) {
            state.signCalls.push({ bucket, op: "remove", paths });
            state.removedPaths.push(...paths);
            return Promise.resolve({ data: [], error: null });
          },
        };
      },
    },
  };
}

beforeEach(() => {
  state.patients = [{ id: patientId, clinic_id: clinicId }];
  state.files = [];
  state.signCalls = [];
  state.updatePayloads = [];
  state.removedPaths = [];
  state.byteUploads = 0;
  state.uploadError = null;
  mocks.requireMember.mockReset();
  mocks.createClient.mockReset();
  mocks.revalidatePath.mockReset();
  mocks.requireMember.mockResolvedValue({ userId, clinicId, role: "owner" });
  mocks.createClient.mockImplementation(async () => createMemory());
  vi.useFakeTimers();
  vi.setSystemTime(createdAt);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("preparePatientFileUpload", () => {
  it("gives the owner a signed upload URL under the clinic on 2026-06-08", async () => {
    const source = readFileSync(path.join(process.cwd(), "app/actions/files.ts"), "utf8");
    const result = await preparePatientFileUpload(null, uploadForm());

    expect(DAY).toBe("2026-06-08");
    expect(source).toContain("isDocumentLocked(");
    expect(source).toContain('from "zod"');
    expect(source).toContain("ActionResult");
    expect(source).toContain("upsert: false");
    expect(source).not.toContain("upsert: true");
    expect(source).not.toContain(".upload(");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.clinicId).toBe(clinicId);
    expect(result.data.path.startsWith(`${clinicId}/${patientId}/`)).toBe(true);
    expect(result.data.path.endsWith(".jpg")).toBe(true);
    expect(result.data.uploadUrl).toContain(result.data.path);
    expect(state.signCalls).toEqual([
      { bucket: "patient-files", op: "upload", path: result.data.path, upsert: false },
    ]);
    expect(state.byteUploads).toBe(0);
  });

  it("signs PNG, WebP, and PDF under the same clinic on 2026-06-08", async () => {
    for (const [mimeType, extension] of [
      ["image/png", "png"],
      ["image/webp", "webp"],
      ["application/pdf", "pdf"],
    ] as const) {
      state.signCalls = [];
      const result = await preparePatientFileUpload(null, uploadForm({ mimeType }));
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.data.path.endsWith(`.${extension}`)).toBe(true);
      expect(result.data.path.startsWith(`${clinicId}/`)).toBe(true);
    }
  });

  it("does not give reception a signed URL on 2026-06-08", async () => {
    mocks.requireMember.mockResolvedValue({ userId, clinicId, role: "reception" });

    const prepared = await preparePatientFileUpload(null, uploadForm());
    const opened = await openPatientFile(null, viewForm("preview"));
    const downloaded = await openPatientFile(null, viewForm("download"));
    const confirmed = await confirmPatientFile(null, confirmForm(fileId));

    expect(prepared).toMatchObject({ ok: false, error: "Dokumenti nisu dostupni." });
    expect(opened).toMatchObject({ ok: false, error: "Dokumenti nisu dostupni." });
    expect(downloaded).toMatchObject({ ok: false, error: "Dokumenti nisu dostupni." });
    expect(confirmed).toMatchObject({ ok: false, error: "Dokumenti nisu dostupni." });
    expect(JSON.stringify(prepared)).not.toMatch(/https?:/);
    expect(JSON.stringify(opened)).not.toMatch(/https?:/);
    expect(JSON.stringify(downloaded)).not.toMatch(/https?:/);
    expect(JSON.stringify(confirmed)).not.toMatch(/https?:/);
    expect(mocks.requireMember).toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(state.signCalls).toEqual([]);
    expect(state.files).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a file over 10 MB before signing a URL", async () => {
    const result = await preparePatientFileUpload(null, uploadForm({ sizeBytes: "10485761" }));

    expect(result).toMatchObject({
      ok: false,
      error: "Proverite unete podatke.",
      fieldErrors: { sizeBytes: ["Fajl može imati najviše 10 MB."] },
    });
    expect(JSON.stringify(result)).not.toContain("Nema dovoljno prostora");
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(state.signCalls).toEqual([]);
  });

  it("rejects a capture date after 2026-06-08", async () => {
    const result = await preparePatientFileUpload(null, uploadForm({ capturedOn: "2026-06-09" }));

    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { capturedOn: ["Datum snimanja ne može biti u budućnosti."] },
    });
    expect(state.signCalls).toEqual([]);
  });

  it("reports missing space only when storage refuses the write", async () => {
    state.uploadError = { status: 413, message: "Payload too large" };

    const result = await preparePatientFileUpload(null, uploadForm());

    expect(result).toEqual({ ok: false, error: "Nema dovoljno prostora za ovaj fajl." });
    expect(JSON.stringify(result)).not.toMatch(/https?:/);
  });
});

describe("confirmPatientFile", () => {
  it("stores metadata and does not upload or replace bytes on 2026-06-08", async () => {
    const prepared = await preparePatientFileUpload(null, uploadForm());
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    const confirmed = await confirmPatientFile(null, confirmForm(prepared.data.fileId));

    expect(confirmed).toEqual({ ok: true, data: { id: prepared.data.fileId } });
    expect(state.files[0]).toMatchObject({
      id: prepared.data.fileId,
      storage_path: prepared.data.path,
      mime_type: "image/jpeg",
      size_bytes: 10485760,
      title: "Snimak",
    });
    expect(state.byteUploads).toBe(0);
    expect(state.signCalls.some((call) => call.op === "upload" && call.upsert)).toBe(false);
  });
});

describe("openPatientFile", () => {
  it("gives the dentist a short signed URL for a clinic path on 2026-06-08", async () => {
    seedFile();
    mocks.requireMember.mockResolvedValue({ userId, clinicId, role: "dentist" });

    const result = await openPatientFile(null, viewForm());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.url).toContain(storagePath);
    expect(state.signCalls).toEqual([
      { bucket: "patient-files", op: "read", path: storagePath, expiresIn: 60, download: false },
    ]);
  });

  it("does not sign a path outside the clinic on 2026-06-08", async () => {
    seedFile(`${otherClinicId}/${patientId}/${fileId}.jpg`);

    const result = await openPatientFile(null, viewForm());

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/https?:/);
    expect(state.signCalls).toEqual([]);
  });
});

describe("updatePatientFile", () => {
  it("updates the title and category and leaves the file content on 2026-06-08", async () => {
    seedFile();
    const data = editForm({ title: "Kontrolni snimak", category: "photo", capturedOn: "2026-06-07" });
    data.set("mimeType", "application/pdf");
    data.set("sizeBytes", "5");
    data.set("storagePath", `${otherClinicId}/${patientId}/${fileId}.pdf`);

    const result = await updatePatientFile(null, data);

    expect(result).toEqual({ ok: true, data: { id: fileId } });
    expect(state.updatePayloads).toEqual([
      { title: "Kontrolni snimak", category: "photo", captured_on: "2026-06-07" },
    ]);
    expect(state.files[0]).toMatchObject({
      title: "Kontrolni snimak",
      category: "photo",
      captured_on: "2026-06-07",
      mime_type: "image/jpeg",
      size_bytes: 1200,
      storage_path: storagePath,
    });
    expect(state.byteUploads).toBe(0);
    expect(state.signCalls).toEqual([]);
  });

  it("does not update a document after 24 hours on 2026-06-08", async () => {
    seedFile();
    vi.setSystemTime(new Date(createdAt.getTime() + 24 * 60 * 60 * 1000));

    const result = await updatePatientFile(null, editForm({ title: "Izmena" }));

    expect(result).toMatchObject({ ok: false, error: "Dokument je zaključan." });
    expect(state.files[0]).toMatchObject({
      title: "Snimak",
      mime_type: "image/jpeg",
      size_bytes: 1200,
      storage_path: storagePath,
    });
    expect(state.updatePayloads).toEqual([]);
    expect(state.byteUploads).toBe(0);
    expect(state.signCalls).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("deletePatientFile", () => {
  it("does not delete a document after 24 hours on 2026-06-08", async () => {
    seedFile();
    vi.setSystemTime(new Date(createdAt.getTime() + 24 * 60 * 60 * 1000));

    const result = await deletePatientFile(null, deleteForm());

    expect(result).toMatchObject({ ok: false, error: "Dokument je zaključan." });
    expect(state.files).toHaveLength(1);
    expect(state.removedPaths).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("listPatientFiles", () => {
  it("does not give reception a file URL on 2026-06-08", async () => {
    seedFile();
    mocks.requireMember.mockResolvedValue({ userId, clinicId, role: "reception" });

    const result = await listPatientFiles(patientId);

    expect(result).toMatchObject({ ok: false, error: "Dokumenti nisu dostupni." });
    expect(JSON.stringify(result)).not.toMatch(/https?:/);
    expect(JSON.stringify(result)).not.toContain(storagePath);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("returns metadata without a storage path or URL on 2026-06-08", async () => {
    seedFile();

    const result = await listPatientFiles(patientId);

    expect(result).toEqual({
      ok: true,
      data: {
        documents: [
          {
            id: fileId,
            title: "Snimak",
            category: "xray",
            capturedOn: DAY,
            createdAt: createdAt.toISOString(),
            mimeType: "image/jpeg",
            sizeBytes: 1200,
          },
        ],
      },
    });
    expect(JSON.stringify(result)).not.toContain(storagePath);
    expect(JSON.stringify(result)).not.toMatch(/https?:/);
  });
});
