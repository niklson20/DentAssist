import { randomBytes } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  addCalendarDays,
  formatBelgradeDate,
  isoDayOfWeek,
  localTimeOnDate,
  needsPatientEmailTask,
} from "../lib/calendar-dates";
import { assertSupabaseTarget } from "../playwright.config";

const childBirth = "2015-06-08";
const turnedBirth = "2011-06-08";
const parentBirth = "1990-06-08";
const parentPhone = "+381601110002";
const taskDay = "2026-06-08";
const dayBeforeTask = "2026-06-07";
const appointmentTime = "10:00";
const appOrigin = "http://localhost:3000";

type CreatedRows = {
  userIds: string[];
  clinicId: string | null;
};

type ChartRow = {
  id: string;
  email: string | null;
  dateOfBirth: string;
  emailDeclined: boolean;
};

type ContactRow = {
  email: string | null;
  relationship: string;
};

type LinkRow = {
  accountId: string;
  dependentId: string | null;
  patientId: string;
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

function nullableText(row: Record<string, unknown>, field: string): string | null {
  const value = row[field];
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(field);
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

function chartFrom(row: Record<string, unknown>): ChartRow {
  const declined = row.email_declined;
  if (typeof declined !== "boolean") throw new Error("patients");
  return {
    id: textField(row, "id"),
    email: nullableText(row, "email"),
    dateOfBirth: textField(row, "date_of_birth"),
    emailDeclined: declined,
  };
}

function contactFrom(row: Record<string, unknown>): ContactRow {
  return {
    email: nullableText(row, "email"),
    relationship: textField(row, "relationship"),
  };
}

function linkFrom(row: Record<string, unknown>): LinkRow {
  const dependentId = row.dependent_id;
  if (dependentId !== null && typeof dependentId !== "string") throw new Error("patient_chart_links");
  return {
    accountId: textField(row, "account_id"),
    dependentId,
    patientId: textField(row, "patient_id"),
  };
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

async function insertClinic(admin: SupabaseClient, slug: string): Promise<string> {
  const { data, error } = await admin
    .from("clinics")
    .insert({
      name: "E2E Dete",
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

async function insertType(admin: SupabaseClient, clinicId: string): Promise<void> {
  const { data, error } = await admin
    .from("appointment_types")
    .insert({ clinic_id: clinicId, name: "Pregled", sort_order: 0 })
    .select("id")
    .single();
  raiseIf(error);
  const typeId = textField(objectFrom(data, "appointment_types"), "id");
  const saved = await admin.from("clinics").update({ default_appointment_type_id: typeId }).eq("id", clinicId);
  raiseIf(saved.error);
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
      first_name: "Marko",
      last_name: "Roditelj",
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
      first_name: "Luka",
      last_name: "Dete",
      date_of_birth: childBirth,
      relationship: "father",
    })
    .select("id")
    .single();
  raiseIf(error);
  return textField(objectFrom(data, "patient_dependents"), "id");
}

async function readCharts(owner: SupabaseClient, clinicId: string): Promise<ChartRow[]> {
  const loaded = await owner
    .from("patients")
    .select("id, email, date_of_birth, email_declined")
    .eq("clinic_id", clinicId);
  raiseIf(loaded.error);
  return rowsFrom(loaded.data, "patients").map(chartFrom);
}

async function readContacts(owner: SupabaseClient, clinicId: string, patientId: string): Promise<ContactRow[]> {
  const loaded = await owner
    .from("patient_contacts")
    .select("email, relationship")
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId);
  raiseIf(loaded.error);
  return rowsFrom(loaded.data, "patient_contacts").map(contactFrom);
}

async function readLinks(owner: SupabaseClient, clinicId: string, patientId: string): Promise<LinkRow[]> {
  const loaded = await owner
    .from("patient_chart_links")
    .select("account_id, dependent_id, patient_id")
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId);
  raiseIf(loaded.error);
  return rowsFrom(loaded.data, "patient_chart_links").map(linkFrom);
}

async function requestStatus(owner: SupabaseClient, requestId: string): Promise<string> {
  const loaded = await owner.from("booking_requests").select("status").eq("id", requestId).single();
  raiseIf(loaded.error);
  return textField(objectFrom(loaded.data, "booking_requests"), "status");
}

async function acceptVisibleRequest(page: Page, email: string, password: string): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${appOrigin}/prijava`);
  await page.getByLabel("Mejl").fill(email);
  await page.getByLabel("Lozinka").fill(password);
  await page.getByRole("button", { name: "Prijavi se" }).click();
  await expect(page.getByRole("heading", { name: "Danas" })).toBeVisible();
  const accept = page.getByRole("button", { name: "Prihvati" });
  await expect(accept).toBeVisible();
  await accept.click();
}

async function removeCreated(admin: SupabaseClient, created: CreatedRows): Promise<void> {
  if (created.clinicId !== null) {
    const clinicId = created.clinicId;
    const requests = await admin.from("booking_requests").select("id").eq("clinic_id", clinicId);
    raiseIf(requests.error);
    const requestIds = idsFrom(requests.data, "id");
    if (requestIds.length > 0) {
      const offers = await admin.from("appointment_offers").delete().in("booking_request_id", requestIds);
      raiseIf(offers.error);
    }
    const clearHolds = await admin.from("appointments").update({ booking_request_id: null }).eq("clinic_id", clinicId);
    raiseIf(clearHolds.error);
    const clearRequests = await admin
      .from("booking_requests")
      .update({ appointment_id: null })
      .eq("clinic_id", clinicId);
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
  if (created.userIds.length > 0) {
    const accounts = await admin.from("patient_accounts").delete().in("user_id", created.userIds);
    raiseIf(accounts.error);
  }
  for (const userId of created.userIds) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    raiseIf(error);
  }
}

test("child fifteenth birthday", async ({ page }) => {
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
  const created: CreatedRows = { userIds: [], clinicId: null };

  try {
    const ownerEmail = `e2e-dete-${suffix}-owner@example.com`;
    const parentEmail = `e2e-dete-${suffix}-parent@example.com`;
    const slug = `e2e-dete-${suffix}`;
    const day = appointmentDay(new Date());
    const start = localTimeOnDate(day, appointmentTime).toISOString();

    const ownerUserId = await createConfirmedUser(admin, ownerEmail, password);
    created.userIds.push(ownerUserId);
    const parentUserId = await createConfirmedUser(admin, parentEmail, password);
    created.userIds.push(parentUserId);

    const clinicId = await insertClinic(admin, slug);
    created.clinicId = clinicId;
    await insertType(admin, clinicId);
    const dentistId = await insertDentist(admin, clinicId, ownerUserId);
    await insertHours(admin, clinicId, dentistId);
    const accountId = await insertAccount(admin, parentUserId, parentEmail);
    const dependentId = await insertDependent(admin, accountId);

    const parent = await signIn(url, publishableKey, parentEmail, password);
    const listed = await parent.rpc("get_available_slots", {
      slug,
      dentist_id: dentistId,
      day,
    });
    raiseIf(listed.error);
    const startsAt = slotStarts(listed.data).find((slot) => instant(slot) === instant(start));
    if (startsAt === undefined) throw new Error("slots");

    const booked = await parent.rpc("create_booking", {
      slug,
      dentist_id: dentistId,
      starts_at: startsAt,
      for_child: true,
      dependent_id: dependentId,
      phone: null,
      date_of_birth: null,
      contact: null,
      reason: null,
    });
    raiseIf(booked.error);
    const requestId = requestIdFrom(booked.data);

    const owner = await signIn(url, publishableKey, ownerEmail, password);
    await acceptVisibleRequest(page, ownerEmail, password);
    await expect.poll(() => requestStatus(owner, requestId)).toBe("accepted");

    const charts = await readCharts(owner, clinicId);
    expect(charts).toHaveLength(1);
    const chart = charts[0];
    if (chart === undefined) throw new Error("patients");
    expect(chart.email).toBeNull();
    expect(chart.email).not.toBe(parentEmail);
    expect(chart.dateOfBirth).toBe(childBirth);
    expect(chart.emailDeclined).toBe(false);

    const contacts = await readContacts(owner, clinicId, chart.id);
    expect(contacts).toEqual([{ email: parentEmail, relationship: "father" }]);

    const links = await readLinks(owner, clinicId, chart.id);
    expect(links).toEqual([{ accountId, dependentId, patientId: chart.id }]);

    const shifted = await admin
      .from("patients")
      .update({ date_of_birth: turnedBirth })
      .eq("id", chart.id)
      .select("id")
      .single();
    raiseIf(shifted.error);

    const after = await readCharts(owner, clinicId);
    expect(after).toHaveLength(1);
    const turned = after[0];
    if (turned === undefined) throw new Error("patients");
    expect(turned.email).toBeNull();
    expect(turned.dateOfBirth).toBe(turnedBirth);
    expect(turned.emailDeclined).toBe(false);
    const keptContacts = await readContacts(owner, clinicId, turned.id);
    expect(keptContacts).toEqual([{ email: parentEmail, relationship: "father" }]);

    const task = {
      hasContact: keptContacts.length > 0,
      dateOfBirth: turned.dateOfBirth,
      email: turned.email,
      emailDeclined: turned.emailDeclined,
    };
    expect(needsPatientEmailTask({ ...task, onDate: taskDay })).toBe(true);
    expect(needsPatientEmailTask({ ...task, onDate: dayBeforeTask })).toBe(false);
  } finally {
    await removeCreated(admin, created);
  }
});
