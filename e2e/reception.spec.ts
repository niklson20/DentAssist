import { randomBytes, randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { assertSupabaseTarget } from "../playwright.config";

const scheduledStart = "2026-06-08T10:00:00+02:00";
const scheduledEnd = "2026-06-08T10:30:00+02:00";
const belgrade = "Europe/Belgrade";

type CreatedRows = {
  userIds: string[];
  clinicId: string | null;
};

type CompletedWindow = {
  startsAt: string;
  endsAt: string;
};

type WallClock = {
  hour: number;
  minute: number;
  second: number;
};

type VisitRow = {
  id: string;
  appointmentId: string;
};

type FileRow = {
  id: string;
  category: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
};

function requiredEnv(name: string): string {
  const value = process.env[name] ?? "";
  if (value === "") throw new Error(name);
  return value;
}

function client(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function raiseIf(error: { message: string } | null): void {
  if (error !== null) throw new Error(error.message);
}

function recordFrom(data: unknown, label: string): Record<string, unknown> {
  if (typeof data !== "object" || data === null || Array.isArray(data)) throw new Error(label);
  return data as Record<string, unknown>;
}

function rowsFrom(data: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(data)) throw new Error(label);
  return data.map((row) => recordFrom(row, label));
}

function textField(row: Record<string, unknown>, field: string): string {
  const value = row[field];
  if (typeof value !== "string" || value === "") throw new Error(field);
  return value;
}

function numberField(row: Record<string, unknown>, field: string): number {
  const value = row[field];
  if (typeof value !== "number") throw new Error(field);
  return value;
}

function idFrom(data: unknown, label: string): string {
  return textField(recordFrom(data, label), "id");
}

function wallClock(instant: Date): WallClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: belgrade,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const read = (type: string): number => {
    const part = parts.find((item) => item.type === type);
    if (part === undefined) throw new Error(belgrade);
    return Number(part.value);
  };
  const hour = read("hour");
  return {
    hour: hour === 24 ? 0 : hour,
    minute: read("minute"),
    second: read("second"),
  };
}

function isQuarterHour(instant: Date): boolean {
  const clock = wallClock(instant);
  return instant.getMilliseconds() === 0 && clock.second === 0 && clock.minute % 15 === 0;
}

// A visit older than 24 hours after ends_at is rejected, so this end stays ahead of now().
function completedWindow(nowMs: number): CompletedWindow {
  const blockedStartMs = Date.parse(scheduledStart);
  const blockedEndMs = Date.parse(scheduledEnd);
  const minimumStart = nowMs + 30 * 60 * 1000;
  const initial = wallClock(new Date(minimumStart));
  const milliseconds = new Date(minimumStart).getMilliseconds();
  let startMs = minimumStart - initial.second * 1000 - milliseconds;
  if (initial.second !== 0 || milliseconds !== 0 || initial.minute % 15 !== 0) {
    const remainder = initial.minute % 15;
    startMs += (remainder === 0 ? 15 : 15 - remainder) * 60 * 1000;
  }

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const endMs = startMs + 30 * 60 * 1000;
    const clearOfScheduled = startMs >= blockedEndMs || endMs <= blockedStartMs;
    if (isQuarterHour(new Date(startMs)) && endMs >= nowMs + 60 * 60 * 1000 && clearOfScheduled) {
      return {
        startsAt: new Date(startMs).toISOString(),
        endsAt: new Date(endMs).toISOString(),
      };
    }
    startMs += 15 * 60 * 1000;
  }

  throw new Error("appointments");
}

async function createConfirmedUser(
  admin: SupabaseClient,
  email: string,
  password: string,
): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error !== null || data.user === null) throw new Error(error?.message ?? "auth.users");
  return data.user.id;
}

async function signIn(url: string, key: string, email: string, password: string): Promise<SupabaseClient> {
  const signedIn = client(url, key);
  const { error } = await signedIn.auth.signInWithPassword({ email, password });
  raiseIf(error);
  return signedIn;
}

async function insertClinic(admin: SupabaseClient, slug: string): Promise<string> {
  const { data, error } = await admin
    .from("clinics")
    .insert({
      name: "E2E Recepcija",
      slug,
      city: "Beograd",
      slot_minutes: 15,
      buffer_minutes: 0,
      default_duration_min: 30,
      min_notice_minutes: 0,
      max_ahead_days: 30,
    })
    .select("id")
    .single();
  raiseIf(error);
  return idFrom(data, "clinics");
}

async function insertMember(
  admin: SupabaseClient,
  clinicId: string,
  userId: string,
  role: "owner" | "reception",
  firstName: string,
): Promise<string> {
  const { data, error } = await admin
    .from("clinic_members")
    .insert({
      clinic_id: clinicId,
      user_id: userId,
      role,
      sees_patients: role === "owner",
      listed_online: false,
      first_name: firstName,
      last_name: "Clan",
    })
    .select("id")
    .single();
  raiseIf(error);
  return idFrom(data, "clinic_members");
}

async function insertPatient(admin: SupabaseClient, clinicId: string): Promise<string> {
  const { data, error } = await admin
    .from("patients")
    .insert({
      clinic_id: clinicId,
      first_name: "Marko",
      last_name: "Karton",
      slug: "karton",
    })
    .select("id")
    .single();
  raiseIf(error);
  return idFrom(data, "patients");
}

async function insertType(admin: SupabaseClient, clinicId: string): Promise<string> {
  const { data, error } = await admin
    .from("appointment_types")
    .insert({ clinic_id: clinicId, name: "Pregled", sort_order: 0 })
    .select("id")
    .single();
  raiseIf(error);
  return idFrom(data, "appointment_types");
}

async function insertAppointment(
  admin: SupabaseClient,
  clinicId: string,
  dentistId: string,
  patientId: string,
  typeId: string,
  startsAt: string,
  endsAt: string,
  status: "scheduled" | "completed",
): Promise<string> {
  const { data, error } = await admin
    .from("appointments")
    .insert({
      clinic_id: clinicId,
      dentist_id: dentistId,
      patient_id: patientId,
      appointment_type_id: typeId,
      starts_at: startsAt,
      ends_at: endsAt,
      status,
      source: "staff",
    })
    .select("id")
    .single();
  raiseIf(error);
  return idFrom(data, "appointments");
}

async function appointmentStatus(admin: SupabaseClient, appointmentId: string): Promise<string> {
  const loaded = await admin.from("appointments").select("status").eq("id", appointmentId).single();
  raiseIf(loaded.error);
  return textField(recordFrom(loaded.data, "appointments"), "status");
}

async function visitRows(signedIn: SupabaseClient, clinicId: string): Promise<VisitRow[]> {
  const loaded = await signedIn.from("visits").select("id, appointment_id").eq("clinic_id", clinicId);
  raiseIf(loaded.error);
  return rowsFrom(loaded.data, "visits").map((row) => ({
    id: textField(row, "id"),
    appointmentId: textField(row, "appointment_id"),
  }));
}

async function fileRows(signedIn: SupabaseClient, clinicId: string): Promise<FileRow[]> {
  const loaded = await signedIn
    .from("patient_files")
    .select("id, category, mime_type, size_bytes, storage_path")
    .eq("clinic_id", clinicId);
  raiseIf(loaded.error);
  return rowsFrom(loaded.data, "patient_files").map((row) => ({
    id: textField(row, "id"),
    category: textField(row, "category"),
    mimeType: textField(row, "mime_type"),
    sizeBytes: numberField(row, "size_bytes"),
    storagePath: textField(row, "storage_path"),
  }));
}

async function removeCreated(admin: SupabaseClient, created: CreatedRows): Promise<void> {
  if (created.clinicId !== null) {
    const clinicId = created.clinicId;
    const visits = await admin.from("visits").delete().eq("clinic_id", clinicId);
    raiseIf(visits.error);
    const appointments = await admin.from("appointments").delete().eq("clinic_id", clinicId);
    raiseIf(appointments.error);
    const files = await admin.from("patient_files").delete().eq("clinic_id", clinicId);
    raiseIf(files.error);
    const patients = await admin.from("patients").delete().eq("clinic_id", clinicId);
    raiseIf(patients.error);
    const audit = await admin.from("audit_log").delete().eq("clinic_id", clinicId);
    raiseIf(audit.error);
    const types = await admin.from("appointment_types").delete().eq("clinic_id", clinicId);
    raiseIf(types.error);
    const clinic = await admin.from("clinics").delete().eq("id", clinicId);
    raiseIf(clinic.error);
  }
  for (const userId of created.userIds) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    raiseIf(error);
  }
}

test("reception limits", async () => {
  test.setTimeout(120_000);

  expect(() =>
    assertSupabaseTarget("https://iirzzaykgskjouzzvdrd.supabase.co", "NEXT_PUBLIC_SUPABASE_URL"),
  ).toThrow("Refusing production ref iirzzaykgskjouzzvdrd");

  const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  assertSupabaseTarget(url, "NEXT_PUBLIC_SUPABASE_URL");
  const databaseUrl = process.env.SUPABASE_DB_URL ?? "";
  if (databaseUrl !== "") assertSupabaseTarget(databaseUrl, "SUPABASE_DB_URL");

  const nowMs = Date.now();
  const visitSlot = completedWindow(nowMs);
  expect(Date.parse(visitSlot.endsAt) - Date.parse(visitSlot.startsAt)).toBe(30 * 60 * 1000);
  expect(Date.parse(visitSlot.endsAt)).toBeGreaterThanOrEqual(nowMs + 60 * 60 * 1000);
  expect(isQuarterHour(new Date(visitSlot.startsAt))).toBe(true);

  const admin = client(url, requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
  const publishableKey = requiredEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const suffix = randomBytes(4).toString("hex");
  const password = randomBytes(24).toString("base64url");
  const created: CreatedRows = { userIds: [], clinicId: null };

  try {
    const ownerEmail = `e2e-reception-${suffix}-owner@example.com`;
    const receptionEmail = `e2e-reception-${suffix}-desk@example.com`;
    const ownerUserId = await createConfirmedUser(admin, ownerEmail, password);
    created.userIds.push(ownerUserId);
    const receptionUserId = await createConfirmedUser(admin, receptionEmail, password);
    created.userIds.push(receptionUserId);

    const clinicId = await insertClinic(admin, `e2e-recepcija-${suffix}`);
    created.clinicId = clinicId;
    const ownerMemberId = await insertMember(admin, clinicId, ownerUserId, "owner", "Mila");
    await insertMember(admin, clinicId, receptionUserId, "reception", "Iva");
    const patientId = await insertPatient(admin, clinicId);
    const typeId = await insertType(admin, clinicId);

    const scheduledId = await insertAppointment(
      admin,
      clinicId,
      ownerMemberId,
      patientId,
      typeId,
      scheduledStart,
      scheduledEnd,
      "scheduled",
    );
    const completedId = await insertAppointment(
      admin,
      clinicId,
      ownerMemberId,
      patientId,
      typeId,
      visitSlot.startsAt,
      visitSlot.endsAt,
      "completed",
    );

    const reception = await signIn(url, publishableKey, receptionEmail, password);
    const completed = await reception.from("appointments").update({ status: "completed" }).eq("id", scheduledId);
    expect(completed.error).not.toBeNull();
    expect(await appointmentStatus(admin, scheduledId)).toBe("scheduled");

    const missed = await reception.from("appointments").update({ status: "no_show" }).eq("id", scheduledId);
    raiseIf(missed.error);
    expect(await appointmentStatus(admin, scheduledId)).toBe("no_show");

    const saved = await reception.rpc("save_visit", {
      p_appointment_id: completedId,
      p_procedure_description: "Pregled",
      p_recommendations: null,
      p_treatment_plan: null,
      p_internal_notes: null,
    });
    expect(saved.error).not.toBeNull();
    expect(saved.data).toBeNull();
    expect(await visitRows(admin, clinicId)).toEqual([]);

    const insertedVisit = await admin
      .from("visits")
      .insert({
        appointment_id: completedId,
        clinic_id: clinicId,
        patient_id: patientId,
        procedure_description: "Pregled",
      })
      .select("id")
      .single();
    raiseIf(insertedVisit.error);
    const visitId = idFrom(insertedVisit.data, "visits");

    const fileId = randomUUID();
    const storagePath = `${clinicId}/${patientId}/${fileId}.pdf`;
    const insertedFile = await admin.from("patient_files").insert({
      id: fileId,
      patient_id: patientId,
      clinic_id: clinicId,
      title: "Izvestaj",
      category: "report",
      mime_type: "application/pdf",
      size_bytes: 1000,
      storage_path: storagePath,
    });
    raiseIf(insertedFile.error);

    const owner = await signIn(url, publishableKey, ownerEmail, password);
    expect(await visitRows(owner, clinicId)).toEqual([{ id: visitId, appointmentId: completedId }]);
    expect(await fileRows(owner, clinicId)).toEqual([
      {
        id: fileId,
        category: "report",
        mimeType: "application/pdf",
        sizeBytes: 1000,
        storagePath,
      },
    ]);
    expect(await visitRows(reception, clinicId)).toEqual([]);
    expect(await fileRows(reception, clinicId)).toEqual([]);
  } finally {
    await removeCreated(admin, created);
  }
});
