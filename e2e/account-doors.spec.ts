import { randomBytes } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { addCalendarDays, formatBelgradeDate, isoDayOfWeek, localTimeOnDate } from "../lib/calendar-dates";
import { assertSupabaseTarget } from "../playwright.config";

const parentBirth = "1990-06-08";
const childBirth = "2015-06-08";
const parentPhone = "+381601110003";
const childFirstName = "Luka";
const childLastName = "Dete";
const parentFirstName = "Marko";
const parentLastName = "Roditelj";
const appOrigin = "http://localhost:3000";

type CreatedRows = {
  userIds: string[];
  clinicIds: string[];
};

type RequestIdentity = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
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

function textField(row: Record<string, unknown>, field: string): string {
  const value = row[field];
  if (typeof value !== "string" || value === "") throw new Error(field);
  return value;
}

function objectFrom(data: unknown, label: string): Record<string, unknown> {
  if (typeof data !== "object" || data === null || Array.isArray(data)) throw new Error(label);
  return data as Record<string, unknown>;
}

function rowsFrom(data: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(data)) throw new Error(label);
  return data.map((row) => objectFrom(row, label));
}

function idsFrom(data: unknown, field: string): string[] {
  return rowsFrom(data, field).map((row) => textField(row, field));
}

function requestIdFrom(data: unknown): string {
  if (typeof data !== "string" || !/^[0-9a-f-]{36}$/i.test(data)) throw new Error("create_booking");
  return data;
}

function instant(value: string): number {
  const time = Date.parse(value);
  if (Number.isNaN(time)) throw new Error("instant");
  return time;
}

function slotStarts(data: unknown): string[] {
  if (!Array.isArray(data)) throw new Error("slots");
  return data.map((row) => {
    if (typeof row === "string") return row;
    return textField(objectFrom(row, "slots"), "starts_at");
  });
}

function appointmentDay(now: Date): string {
  const earliest = addCalendarDays(formatBelgradeDate(now), 7);
  const weekday = isoDayOfWeek(earliest);
  return addCalendarDays(earliest, weekday === 1 ? 0 : 8 - weekday);
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

async function signIn(
  url: string,
  key: string,
  email: string,
  password: string,
): Promise<SupabaseClient> {
  const signedIn = client(url, key);
  const { error } = await signedIn.auth.signInWithPassword({ email, password });
  raiseIf(error);
  return signedIn;
}

async function insertClinic(
  admin: SupabaseClient,
  slug: string,
  name: string,
): Promise<string> {
  const { data, error } = await admin
    .from("clinics")
    .insert({
      name,
      slug,
      city: "Beograd",
      address: "Knez Mihailova 1",
      phone: "+381112345678",
      slot_minutes: 15,
      buffer_minutes: 0,
      default_duration_min: 30,
      min_notice_minutes: 0,
      max_ahead_days: 30,
      online_booking_enabled: true,
      setup_completed_at: "2026-01-01T00:00:00.000Z",
      status: "active",
    })
    .select("id")
    .single();
  raiseIf(error);
  return textField(objectFrom(data, "clinics"), "id");
}

async function insertType(admin: SupabaseClient, clinicId: string): Promise<string> {
  const { data, error } = await admin
    .from("appointment_types")
    .insert({ clinic_id: clinicId, name: "Pregled", sort_order: 0 })
    .select("id")
    .single();
  raiseIf(error);
  const typeId = textField(objectFrom(data, "appointment_types"), "id");
  const saved = await admin.from("clinics").update({ default_appointment_type_id: typeId }).eq("id", clinicId);
  raiseIf(saved.error);
  return typeId;
}

async function insertDentist(
  admin: SupabaseClient,
  clinicId: string,
  userId: string,
): Promise<string> {
  const { data, error } = await admin
    .from("clinic_members")
    .insert({
      clinic_id: clinicId,
      user_id: userId,
      role: "owner",
      sees_patients: true,
      listed_online: true,
      first_name: "Mila",
      last_name: "Ordinacija",
    })
    .select("id")
    .single();
  raiseIf(error);
  return textField(objectFrom(data, "clinic_members"), "id");
}

async function insertHours(admin: SupabaseClient, clinicId: string, dentistId: string): Promise<void> {
  const rows = [1, 2, 3, 4, 5, 6, 7].map((isoDow) => ({
    clinic_id: clinicId,
    clinic_member_id: dentistId,
    iso_dow: isoDow,
    is_closed: false,
    opens_at: "08:00",
    closes_at: "16:00",
  }));
  const { error } = await admin.from("working_hours").insert(rows);
  raiseIf(error);
}

async function insertAccount(
  admin: SupabaseClient,
  userId: string,
  email: string,
): Promise<string> {
  const { data, error } = await admin
    .from("patient_accounts")
    .insert({
      user_id: userId,
      first_name: parentFirstName,
      last_name: parentLastName,
      email,
      phone: parentPhone,
      date_of_birth: parentBirth,
      email_confirmed_at: "2026-01-01T00:00:00.000Z",
    })
    .select("id")
    .single();
  raiseIf(error);
  return textField(objectFrom(data, "patient_accounts"), "id");
}

async function insertDependent(admin: SupabaseClient, accountId: string): Promise<string> {
  const { data, error } = await admin
    .from("patient_dependents")
    .insert({
      account_id: accountId,
      first_name: childFirstName,
      last_name: childLastName,
      date_of_birth: childBirth,
      relationship: "father",
    })
    .select("id")
    .single();
  raiseIf(error);
  return textField(objectFrom(data, "patient_dependents"), "id");
}

async function insertPatient(
  admin: SupabaseClient,
  clinicId: string,
  email: string,
): Promise<string> {
  const { data, error } = await admin
    .from("patients")
    .insert({
      clinic_id: clinicId,
      first_name: "Petra",
      last_name: "Druga",
      slug: "karton",
      email,
      date_of_birth: "1988-03-03",
    })
    .select("id")
    .single();
  raiseIf(error);
  return textField(objectFrom(data, "patients"), "id");
}

async function insertScheduled(
  admin: SupabaseClient,
  clinicId: string,
  dentistId: string,
  patientId: string,
  typeId: string,
  startsAt: string,
  endsAt: string,
): Promise<void> {
  const { error } = await admin.from("appointments").insert({
    clinic_id: clinicId,
    dentist_id: dentistId,
    patient_id: patientId,
    appointment_type_id: typeId,
    starts_at: startsAt,
    ends_at: endsAt,
    status: "scheduled",
    source: "staff",
  });
  raiseIf(error);
}

async function requestCount(admin: SupabaseClient, clinicId: string): Promise<number> {
  const loaded = await admin.from("booking_requests").select("id").eq("clinic_id", clinicId);
  raiseIf(loaded.error);
  return idsFrom(loaded.data, "id").length;
}

async function requestIdentity(admin: SupabaseClient, requestId: string): Promise<RequestIdentity> {
  const loaded = await admin
    .from("booking_requests")
    .select("patient_first_name, patient_last_name, patient_date_of_birth")
    .eq("id", requestId)
    .single();
  raiseIf(loaded.error);
  const row = objectFrom(loaded.data, "booking_requests");
  return {
    firstName: textField(row, "patient_first_name"),
    lastName: textField(row, "patient_last_name"),
    dateOfBirth: textField(row, "patient_date_of_birth"),
  };
}

async function listedStarts(signedIn: SupabaseClient, slug: string): Promise<string[]> {
  const listed = await signedIn.rpc("list_my_appointments", { slug });
  raiseIf(listed.error);
  return slotStarts(listed.data);
}

async function openSlot(signedIn: SupabaseClient, slug: string, dentistId: string, day: string, start: string): Promise<string> {
  const listed = await signedIn.rpc("get_available_slots", {
    slug,
    dentist_id: dentistId,
    day,
  });
  raiseIf(listed.error);
  const startsAt = slotStarts(listed.data).find((slot) => instant(slot) === instant(start));
  if (startsAt === undefined) throw new Error("slots");
  return startsAt;
}

async function removeClinic(admin: SupabaseClient, clinicId: string): Promise<void> {
  const requests = await admin.from("booking_requests").select("id").eq("clinic_id", clinicId);
  raiseIf(requests.error);
  const requestIds = idsFrom(requests.data, "id");
  if (requestIds.length > 0) {
    const offers = await admin.from("appointment_offers").delete().in("booking_request_id", requestIds);
    raiseIf(offers.error);
  }
  const clearHolds = await admin.from("appointments").update({ booking_request_id: null }).eq("clinic_id", clinicId);
  raiseIf(clearHolds.error);
  const clearRequests = await admin.from("booking_requests").update({ appointment_id: null }).eq("clinic_id", clinicId);
  raiseIf(clearRequests.error);
  const claims = await admin.from("patient_email_claims").delete().eq("clinic_id", clinicId);
  raiseIf(claims.error);
  const deletedRequests = await admin.from("booking_requests").delete().eq("clinic_id", clinicId);
  raiseIf(deletedRequests.error);
  const deletedAppointments = await admin.from("appointments").delete().eq("clinic_id", clinicId);
  raiseIf(deletedAppointments.error);
  const deletedPatients = await admin.from("patients").delete().eq("clinic_id", clinicId);
  raiseIf(deletedPatients.error);
  const audit = await admin.from("audit_log").delete().eq("clinic_id", clinicId);
  raiseIf(audit.error);
  const clearType = await admin.from("clinics").update({ default_appointment_type_id: null }).eq("id", clinicId);
  raiseIf(clearType.error);
  const clinic = await admin.from("clinics").delete().eq("id", clinicId);
  raiseIf(clinic.error);
}

async function removeCreated(admin: SupabaseClient, created: CreatedRows): Promise<void> {
  for (const clinicId of created.clinicIds) {
    await removeClinic(admin, clinicId);
  }
  if (created.userIds.length > 0) {
    const accounts = await admin.from("patient_accounts").delete().in("user_id", created.userIds);
    raiseIf(accounts.error);
  }
  for (const userId of created.userIds) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    raiseIf(error);
  }
}

test("account doors", async ({ page }) => {
  test.setTimeout(120_000);

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
  const created: CreatedRows = { userIds: [], clinicIds: [] };

  try {
    const firstOwnerEmail = `e2e-vrata-${suffix}-prva@example.com`;
    const secondOwnerEmail = `e2e-vrata-${suffix}-druga@example.com`;
    const parentEmail = `e2e-vrata-${suffix}-roditelj@example.com`;
    const otherEmail = `e2e-vrata-${suffix}-pacijent@example.com`;
    const firstSlug = `e2e-vrata-${suffix}`;
    const secondSlug = `e2e-vrata-${suffix}-druga`;
    const firstName = `E2E Nalog ${suffix}`;
    const day = appointmentDay(new Date());
    const childStart = localTimeOnDate(day, "10:00").toISOString();
    const otherStart = localTimeOnDate(day, "11:00").toISOString();
    const otherEnd = localTimeOnDate(day, "11:30").toISOString();

    const firstOwnerId = await createConfirmedUser(admin, firstOwnerEmail, password);
    created.userIds.push(firstOwnerId);
    const secondOwnerId = await createConfirmedUser(admin, secondOwnerEmail, password);
    created.userIds.push(secondOwnerId);
    const parentUserId = await createConfirmedUser(admin, parentEmail, password);
    created.userIds.push(parentUserId);

    const firstClinicId = await insertClinic(admin, firstSlug, firstName);
    created.clinicIds.push(firstClinicId);
    await insertType(admin, firstClinicId);
    const firstDentistId = await insertDentist(admin, firstClinicId, firstOwnerId);
    await insertHours(admin, firstClinicId, firstDentistId);

    const secondClinicId = await insertClinic(admin, secondSlug, `E2E Druga ${suffix}`);
    created.clinicIds.push(secondClinicId);
    const secondTypeId = await insertType(admin, secondClinicId);
    const secondDentistId = await insertDentist(admin, secondClinicId, secondOwnerId);
    await insertHours(admin, secondClinicId, secondDentistId);

    const accountId = await insertAccount(admin, parentUserId, parentEmail);
    const dependentId = await insertDependent(admin, accountId);
    const otherPatientId = await insertPatient(admin, secondClinicId, otherEmail);
    await insertScheduled(
      admin,
      secondClinicId,
      secondDentistId,
      otherPatientId,
      secondTypeId,
      otherStart,
      otherEnd,
    );

    const parent = await signIn(url, publishableKey, parentEmail, password);
    const anon = client(url, publishableKey);
    const anonymousRequest = await anon.rpc("create_booking", {
      slug: firstSlug,
      dentist_id: firstDentistId,
      starts_at: childStart,
      for_child: true,
      dependent_id: dependentId,
      phone: null,
      date_of_birth: null,
      contact: null,
      reason: null,
    });
    expect(anonymousRequest.error).not.toBeNull();
    expect(anonymousRequest.data).toBeNull();
    expect(await requestCount(admin, firstClinicId)).toBe(0);

    const startsAt = await openSlot(parent, firstSlug, firstDentistId, day, childStart);
    const booked = await parent.rpc("create_booking", {
      slug: firstSlug,
      dentist_id: firstDentistId,
      starts_at: startsAt,
      for_child: true,
      dependent_id: dependentId,
      phone: null,
      date_of_birth: null,
      contact: null,
      reason: null,
    });
    raiseIf(booked.error);
    const identity = await requestIdentity(admin, requestIdFrom(booked.data));
    expect(identity).toEqual({
      firstName: childFirstName,
      lastName: childLastName,
      dateOfBirth: childBirth,
    });
    expect(identity.firstName).not.toBe(parentFirstName);
    expect(identity.dateOfBirth).not.toBe(parentBirth);
    expect(await requestCount(admin, firstClinicId)).toBe(1);

    const ownStarts = await listedStarts(parent, firstSlug);
    expect(ownStarts.some((slot) => instant(slot) === instant(startsAt))).toBe(true);
    expect(ownStarts.some((slot) => instant(slot) === instant(otherStart))).toBe(false);
    const otherClinicStarts = await listedStarts(parent, secondSlug);
    expect(otherClinicStarts.some((slot) => instant(slot) === instant(startsAt))).toBe(false);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${appOrigin}/ordinacije/${firstSlug}`);
    await expect(page.getByRole("heading", { name: firstName })).toBeVisible();
    await expect(page.getByText("Prijavite se da vidite slobodne termine")).toBeVisible();
    await expect(page.getByText("Pošalji zahtev")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Prijava" })).toHaveAttribute(
      "href",
      `/ordinacije/${firstSlug}/prijava`,
    );
    await expect(page.getByRole("link", { name: "Registracija" })).toHaveAttribute(
      "href",
      `/ordinacije/${firstSlug}/registracija`,
    );
    await expect(page.getByRole("link", { name: "Nazad u imenik" })).toHaveAttribute("href", "/");

    await page.goto(`${appOrigin}/ordinacije/${firstSlug}/prijava`);
    await page.getByLabel("Mejl").fill(parentEmail);
    await page.getByLabel("Lozinka").fill(password);
    await page.getByRole("button", { name: "Prijavi se" }).click();
    await expect(page.getByRole("heading", { name: firstName })).toBeVisible();

    await page.goto(`${appOrigin}/ordinacije/${firstSlug}/termini`);
    await expect(page.getByRole("heading", { name: "Termini" })).toBeVisible();
    await expect(page.getByText("10:00")).toBeVisible();
    await expect(page.getByText("11:00")).toHaveCount(0);

    await page.context().clearCookies();
    await page.goto(`${appOrigin}/ordinacije/${firstSlug}/termini`);
    await expect(page.getByRole("heading", { name: "Prijava" })).toBeVisible();
    await expect(page.getByText("10:00")).toHaveCount(0);
    await expect(page.getByText("11:00")).toHaveCount(0);
  } finally {
    await removeCreated(admin, created);
  }
});
