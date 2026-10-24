import { randomBytes } from "node:crypto";

import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { assertSupabaseTarget } from "../playwright.config";

const chartDate = "2026-06-08";

type CreatedRows = {
  userIds: string[];
  clinicIds: string[];
  platformUserId: string | null;
};

type PatientRow = {
  id: string;
  dateOfBirth: string | null;
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

function patientsFrom(data: unknown): PatientRow[] {
  if (!Array.isArray(data)) throw new Error("patients");
  return data.map((row) => {
    if (typeof row !== "object" || row === null) throw new Error("patients");
    const record = row as Record<string, unknown>;
    if (typeof record.id !== "string") throw new Error("patients");
    if (record.date_of_birth !== null && typeof record.date_of_birth !== "string") {
      throw new Error("patients");
    }
    return {
      id: record.id,
      dateOfBirth: record.date_of_birth,
    };
  });
}

function idsFrom(data: unknown, field: string): string[] {
  if (!Array.isArray(data)) throw new Error(field);
  return data.map((row) => {
    if (typeof row !== "object" || row === null) throw new Error(field);
    const record = row as Record<string, unknown>;
    const value = record[field];
    if (typeof value !== "string") throw new Error(field);
    return value;
  });
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
  if (error !== null || data.user === null) {
    throw new Error(error?.message ?? "auth.users");
  }
  return data.user.id;
}

async function insertClinic(admin: SupabaseClient, slug: string, name: string): Promise<string> {
  const { data, error } = await admin
    .from("clinics")
    .insert({
      name,
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
  if (error !== null) throw new Error(error.message);
  return idsFrom([data], "id")[0] ?? "";
}

async function insertMember(
  admin: SupabaseClient,
  clinicId: string,
  userId: string,
  firstName: string,
): Promise<void> {
  const { error } = await admin.from("clinic_members").insert({
    clinic_id: clinicId,
    user_id: userId,
    role: "owner",
    sees_patients: true,
    listed_online: false,
    first_name: firstName,
    last_name: "Clan",
  });
  if (error !== null) throw new Error(error.message);
}

async function insertPatient(
  admin: SupabaseClient,
  clinicId: string,
  slug: string,
  firstName: string,
): Promise<string> {
  const { data, error } = await admin
    .from("patients")
    .insert({
      clinic_id: clinicId,
      first_name: firstName,
      last_name: "Karton",
      slug,
      date_of_birth: chartDate,
    })
    .select("id")
    .single();
  if (error !== null) throw new Error(error.message);
  return idsFrom([data], "id")[0] ?? "";
}

async function insertAnamnesis(
  admin: SupabaseClient,
  clinicId: string,
  patientId: string,
): Promise<void> {
  const { error } = await admin.from("patient_anamnesis").insert({
    clinic_id: clinicId,
    patient_id: patientId,
    allergies: "penicillin",
  });
  if (error !== null) throw new Error(error.message);
}

async function signIn(url: string, key: string, email: string, password: string): Promise<SupabaseClient> {
  const signedIn = client(url, key);
  const { error } = await signedIn.auth.signInWithPassword({ email, password });
  if (error !== null) throw new Error(error.message);
  return signedIn;
}

async function patientRows(signedIn: SupabaseClient): Promise<PatientRow[]> {
  const { data, error } = await signedIn.from("patients").select("id, date_of_birth");
  if (error !== null) throw new Error(error.message);
  return patientsFrom(data);
}

async function anamnesisIds(signedIn: SupabaseClient): Promise<string[]> {
  const { data, error } = await signedIn.from("patient_anamnesis").select("patient_id");
  if (error !== null) throw new Error(error.message);
  return idsFrom(data, "patient_id");
}

async function clinicIds(signedIn: SupabaseClient, ids: string[]): Promise<string[]> {
  const { data, error } = await signedIn.from("clinics").select("id").in("id", ids);
  if (error !== null) throw new Error(error.message);
  return idsFrom(data, "id");
}

async function removeCreated(admin: SupabaseClient, created: CreatedRows): Promise<void> {
  if (created.clinicIds.length > 0) {
    const clinicIds = created.clinicIds;
    const anamnesis = await admin.from("patient_anamnesis").delete().in("clinic_id", clinicIds);
    if (anamnesis.error !== null) throw new Error(anamnesis.error.message);
    const patients = await admin.from("patients").delete().in("clinic_id", clinicIds);
    if (patients.error !== null) throw new Error(patients.error.message);
    const audit = await admin.from("audit_log").delete().in("clinic_id", clinicIds);
    if (audit.error !== null) throw new Error(audit.error.message);
    const clinics = await admin.from("clinics").delete().in("id", clinicIds);
    if (clinics.error !== null) throw new Error(clinics.error.message);
  }
  if (created.platformUserId !== null) {
    const adminRow = await admin.from("platform_admins").delete().eq("user_id", created.platformUserId);
    if (adminRow.error !== null) throw new Error(adminRow.error.message);
  }
  for (const userId of created.userIds) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error !== null) throw new Error(error.message);
  }
}

test("clinic isolation", async () => {
  expect(() =>
    assertSupabaseTarget("https://iirzzaykgskjouzzvdrd.supabase.co", "NEXT_PUBLIC_SUPABASE_URL"),
  ).toThrow("Refusing production ref iirzzaykgskjouzzvdrd");

  const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  assertSupabaseTarget(url, "NEXT_PUBLIC_SUPABASE_URL");
  const databaseUrl = process.env.SUPABASE_DB_URL ?? "";
  if (databaseUrl !== "") assertSupabaseTarget(databaseUrl, "SUPABASE_DB_URL");

  const admin = client(url, requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
  const publishableKey = requiredEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const suffix = randomBytes(4).toString("hex");
  const password = randomBytes(24).toString("base64url");
  const created: CreatedRows = { userIds: [], clinicIds: [], platformUserId: null };

  try {
    const firstEmail = `e2e-isolation-${suffix}-first@example.com`;
    const secondEmail = `e2e-isolation-${suffix}-second@example.com`;
    const platformEmail = `e2e-isolation-${suffix}-platform@example.com`;

    const firstUserId = await createConfirmedUser(admin, firstEmail, password);
    created.userIds.push(firstUserId);
    const secondUserId = await createConfirmedUser(admin, secondEmail, password);
    created.userIds.push(secondUserId);
    const platformUserId = await createConfirmedUser(admin, platformEmail, password);
    created.userIds.push(platformUserId);
    created.platformUserId = platformUserId;

    const platformAdmin = await admin.from("platform_admins").insert({ user_id: platformUserId });
    if (platformAdmin.error !== null) throw new Error(platformAdmin.error.message);

    const firstClinicId = await insertClinic(admin, `e2e-prva-${suffix}`, "E2E Prva");
    created.clinicIds.push(firstClinicId);
    const secondClinicId = await insertClinic(admin, `e2e-druga-${suffix}`, "E2E Druga");
    created.clinicIds.push(secondClinicId);

    await insertMember(admin, firstClinicId, firstUserId, "Prva");
    await insertMember(admin, secondClinicId, secondUserId, "Druga");

    const firstPatientId = await insertPatient(admin, firstClinicId, "karton-prve", "Prvi");
    const secondPatientId = await insertPatient(admin, secondClinicId, "karton-druge", "Drugi");
    if (firstPatientId === "" || secondPatientId === "") throw new Error("patients");
    await insertAnamnesis(admin, firstClinicId, firstPatientId);
    await insertAnamnesis(admin, secondClinicId, secondPatientId);

    const firstMember = await signIn(url, publishableKey, firstEmail, password);
    const firstPatients = await patientRows(firstMember);
    expect(firstPatients).toEqual([{ id: firstPatientId, dateOfBirth: chartDate }]);
    expect(firstPatients.some((row) => row.id === secondPatientId)).toBe(false);
    expect(await anamnesisIds(firstMember)).toEqual([firstPatientId]);

    const platform = await signIn(url, publishableKey, platformEmail, password);
    const visibleClinics = await clinicIds(platform, [firstClinicId, secondClinicId]);
    expect(visibleClinics).toHaveLength(2);
    expect(visibleClinics).toContain(firstClinicId);
    expect(visibleClinics).toContain(secondClinicId);
    expect(await patientRows(platform)).toEqual([]);
    expect(await anamnesisIds(platform)).toEqual([]);
  } finally {
    await removeCreated(admin, created);
  }
});
