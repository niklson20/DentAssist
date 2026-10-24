import { randomBytes } from "node:crypto";

import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { assertSupabaseTarget } from "../playwright.config";

const exclusionConstraint = "appointments_dentist_overlap_excl";
const firstStart = "2026-06-08T10:00:00+02:00";
const firstEnd = "2026-06-08T10:30:00+02:00";
const overlapStart = "2026-06-08T10:15:00+02:00";
const overlapEnd = "2026-06-08T10:45:00+02:00";
const laterStart = "2026-06-08T10:30:00+02:00";
const laterEnd = "2026-06-08T11:00:00+02:00";

type CreatedRows = {
  userIds: string[];
  clinicId: string | null;
};

type AppointmentStatus = "scheduled" | "cancelled";

type AppointmentInsert = {
  id: string | null;
  errorText: string | null;
};

type AppointmentRow = {
  id: string;
  dentistId: string;
  status: string;
  startsAt: string;
  endsAt: string;
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

function idFrom(data: unknown, label: string): string {
  return textField(recordFrom(data, label), "id");
}

function instant(value: string): number {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new Error("appointments");
  return parsed;
}

function describeError(error: { code?: string; message: string; details?: string }): string {
  const parts = [error.code, error.message, error.details].filter(
    (part): part is string => typeof part === "string" && part !== "",
  );
  return parts.join(" ");
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

async function insertClinic(admin: SupabaseClient, slug: string): Promise<string> {
  const { data, error } = await admin
    .from("clinics")
    .insert({
      name: "E2E Preklapanje",
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

async function insertDentist(
  admin: SupabaseClient,
  clinicId: string,
  userId: string,
  firstName: string,
): Promise<string> {
  const { data, error } = await admin
    .from("clinic_members")
    .insert({
      clinic_id: clinicId,
      user_id: userId,
      role: "dentist",
      sees_patients: true,
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
      date_of_birth: "2026-06-08",
    })
    .select("id")
    .single();
  raiseIf(error);
  return idFrom(data, "patients");
}

async function insertType(admin: SupabaseClient, clinicId: string): Promise<string> {
  const { data, error } = await admin
    .from("appointment_types")
    .insert({ clinic_id: clinicId, name: "Pregled", sort_order: 0, active: true })
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
  status: AppointmentStatus,
): Promise<AppointmentInsert> {
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
  if (error !== null) return { id: null, errorText: describeError(error) };
  return { id: idFrom(data, "appointments"), errorText: null };
}

function insertedId(result: AppointmentInsert): string {
  if (result.id === null || result.errorText !== null) {
    throw new Error(result.errorText ?? "appointments");
  }
  return result.id;
}

async function appointmentRows(admin: SupabaseClient, clinicId: string): Promise<AppointmentRow[]> {
  const loaded = await admin
    .from("appointments")
    .select("id, dentist_id, status, starts_at, ends_at")
    .eq("clinic_id", clinicId);
  raiseIf(loaded.error);
  return rowsFrom(loaded.data, "appointments").map((row) => ({
    id: textField(row, "id"),
    dentistId: textField(row, "dentist_id"),
    status: textField(row, "status"),
    startsAt: textField(row, "starts_at"),
    endsAt: textField(row, "ends_at"),
  }));
}

function sameSlot(row: AppointmentRow, dentistId: string, status: string, startsAt: string, endsAt: string): boolean {
  return (
    row.dentistId === dentistId &&
    row.status === status &&
    instant(row.startsAt) === instant(startsAt) &&
    instant(row.endsAt) === instant(endsAt)
  );
}

async function removeCreated(admin: SupabaseClient, created: CreatedRows): Promise<void> {
  if (created.clinicId !== null) {
    const clinicId = created.clinicId;
    const appointments = await admin.from("appointments").delete().eq("clinic_id", clinicId);
    raiseIf(appointments.error);
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

test("appointment overlap", async () => {
  test.setTimeout(120_000);

  expect(() =>
    assertSupabaseTarget("https://iirzzaykgskjouzzvdrd.supabase.co", "NEXT_PUBLIC_SUPABASE_URL"),
  ).toThrow("Refusing production ref iirzzaykgskjouzzvdrd");

  const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  assertSupabaseTarget(url, "NEXT_PUBLIC_SUPABASE_URL");
  const databaseUrl = process.env.SUPABASE_DB_URL ?? "";
  if (databaseUrl !== "") assertSupabaseTarget(databaseUrl, "SUPABASE_DB_URL");

  const admin = client(url, requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
  const suffix = randomBytes(4).toString("hex");
  const password = randomBytes(24).toString("base64url");
  const created: CreatedRows = { userIds: [], clinicId: null };

  try {
    const firstEmail = `e2e-overlap-${suffix}-first@example.com`;
    const secondEmail = `e2e-overlap-${suffix}-second@example.com`;
    const firstUserId = await createConfirmedUser(admin, firstEmail, password);
    created.userIds.push(firstUserId);
    const secondUserId = await createConfirmedUser(admin, secondEmail, password);
    created.userIds.push(secondUserId);

    const clinicId = await insertClinic(admin, `e2e-preklapanje-${suffix}`);
    created.clinicId = clinicId;
    const firstDentistId = await insertDentist(admin, clinicId, firstUserId, "Ana");
    const secondDentistId = await insertDentist(admin, clinicId, secondUserId, "Lena");
    const patientId = await insertPatient(admin, clinicId);
    const typeId = await insertType(admin, clinicId);

    const firstId = insertedId(
      await insertAppointment(admin, clinicId, firstDentistId, patientId, typeId, firstStart, firstEnd, "scheduled"),
    );
    // Cancelled rows stay out of appointments_dentist_overlap_excl.
    insertedId(
      await insertAppointment(admin, clinicId, firstDentistId, patientId, typeId, firstStart, firstEnd, "cancelled"),
    );

    const blocked = await insertAppointment(
      admin,
      clinicId,
      firstDentistId,
      patientId,
      typeId,
      overlapStart,
      overlapEnd,
      "scheduled",
    );
    expect(blocked.id).toBeNull();
    expect(blocked.errorText).toContain(exclusionConstraint);

    const afterBlock = await appointmentRows(admin, clinicId);
    expect(afterBlock.filter((row) => row.id === firstId && row.status === "scheduled")).toHaveLength(1);
    expect(afterBlock.filter((row) => sameSlot(row, firstDentistId, "scheduled", overlapStart, overlapEnd))).toHaveLength(
      0,
    );

    insertedId(
      await insertAppointment(
        admin,
        clinicId,
        secondDentistId,
        patientId,
        typeId,
        firstStart,
        firstEnd,
        "scheduled",
      ),
    );
    insertedId(
      await insertAppointment(admin, clinicId, firstDentistId, patientId, typeId, laterStart, laterEnd, "scheduled"),
    );

    const rows = await appointmentRows(admin, clinicId);
    expect(rows).toHaveLength(4);
    expect(rows.filter((row) => sameSlot(row, secondDentistId, "scheduled", firstStart, firstEnd))).toHaveLength(1);
    expect(rows.filter((row) => sameSlot(row, firstDentistId, "scheduled", laterStart, laterEnd))).toHaveLength(1);
  } finally {
    await removeCreated(admin, created);
  }
});
