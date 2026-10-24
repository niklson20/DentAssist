import { randomBytes } from "node:crypto";

import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { argon2id } from "hash-wasm";

import { assertSupabaseTarget } from "../playwright.config";

const fixtureDate = "2026-06-08";
// A self booking is allowed only after the 15th birthday. That birthday is the fixture date.
const adultDateOfBirth = "2011-06-08";
const fixtureStart = "2026-06-08T07:00:00.000Z";
const confirmationCode = "246813";
const slotCount = 6;
const slotGapMs = 30 * 60_000;

type CreatedRows = {
  userIds: string[];
  clinicId: string | null;
  patientEmail: string | null;
};

type RequestRow = {
  id: string;
  accountId: string;
  appointmentId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phone: string;
  email: string;
  status: string;
  expiresAt: string;
};

type AppointmentRow = {
  id: string;
  status: string;
  startsAt: string;
  patientId: string | null;
  cancelledBy: string | null;
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

function idsFrom(data: unknown, field: string): string[] {
  if (!Array.isArray(data)) throw new Error(field);
  return data.map((row) => {
    if (typeof row !== "object" || row === null) throw new Error(field);
    return textField(row as Record<string, unknown>, field);
  });
}

function requestIdFrom(data: unknown): string {
  if (typeof data !== "string" || !/^[0-9a-f-]{36}$/i.test(data)) throw new Error("create_booking");
  return data;
}

function objectFrom(data: unknown, label: string): Record<string, unknown> {
  if (typeof data !== "object" || data === null || Array.isArray(data)) throw new Error(label);
  return data as Record<string, unknown>;
}

function statusOf(data: unknown, label: string): string {
  const status = objectFrom(data, label).status;
  if (typeof status !== "string") throw new Error(label);
  return status;
}

function slotStarts(data: unknown): string[] {
  if (data == null) return [];
  if (!Array.isArray(data)) throw new Error("slots");
  return data.map((row) => {
    if (typeof row === "string") return row;
    if (typeof row !== "object" || row === null) throw new Error("slots");
    return textField(row as Record<string, unknown>, "starts_at");
  });
}

function requestFrom(data: unknown): RequestRow {
  const row = objectFrom(data, "booking_requests");
  return {
    id: textField(row, "id"),
    accountId: textField(row, "account_id"),
    appointmentId: textField(row, "appointment_id"),
    firstName: textField(row, "patient_first_name"),
    lastName: textField(row, "patient_last_name"),
    dateOfBirth: textField(row, "patient_date_of_birth"),
    phone: textField(row, "patient_phone"),
    email: textField(row, "booker_email"),
    status: textField(row, "status"),
    expiresAt: textField(row, "expires_at"),
  };
}

function appointmentsFrom(data: unknown): AppointmentRow[] {
  if (!Array.isArray(data)) throw new Error("appointments");
  return data.map((item) => {
    const row = objectFrom(item, "appointments");
    const patientId = row.patient_id;
    const cancelledBy = row.cancelled_by;
    if (patientId !== null && typeof patientId !== "string") throw new Error("appointments");
    if (cancelledBy !== null && typeof cancelledBy !== "string") throw new Error("appointments");
    return {
      id: textField(row, "id"),
      status: textField(row, "status"),
      startsAt: textField(row, "starts_at"),
      patientId,
      cancelledBy,
    };
  });
}

function instant(value: string): number {
  const time = Date.parse(value);
  if (Number.isNaN(time)) throw new Error("instant");
  return time;
}

function plusMinutes(iso: string, minutes: number): string {
  return new Date(instant(iso) + minutes * 60_000).toISOString();
}

function belgradeDay(offsetDays: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Belgrade",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const shifted = new Date(Date.UTC(year, month - 1, day + offsetDays));
  const shiftedMonth = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const shiftedDay = String(shifted.getUTCDate()).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${shiftedMonth}-${shiftedDay}`;
}

function slotAt(slots: string[], index: number): string {
  const slot = slots[index];
  if (slot === undefined) throw new Error("slots");
  return slot;
}

function spaced(slots: string[], count: number): string[] {
  const ordered = [...slots].sort((left, right) => instant(left) - instant(right));
  const picked: string[] = [];
  let last = Number.NEGATIVE_INFINITY;
  for (const slot of ordered) {
    const time = instant(slot);
    if (time < last + slotGapMs) continue;
    picked.push(slot);
    last = time;
    if (picked.length === count) break;
  }
  return picked;
}

function serbianPhone(suffix: string): string {
  const tail = String(Number.parseInt(suffix, 16) % 10_000_000).padStart(7, "0");
  return `+38164${tail}`;
}

async function hashCode(code: string): Promise<string> {
  return argon2id({
    password: code,
    salt: randomBytes(16),
    parallelism: 1,
    iterations: 2,
    memorySize: 19_456,
    hashLength: 32,
    outputType: "encoded",
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
      name: "E2E Zahtev",
      slug,
      city: "Beograd",
      address: "Knez Mihailova 1",
      phone: "+381112345678",
      slot_minutes: 15,
      buffer_minutes: 0,
      default_duration_min: 30,
      min_notice_minutes: 0,
      max_ahead_days: 14,
      online_booking_enabled: true,
      setup_completed_at: new Date().toISOString(),
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
  const saved = await admin
    .from("clinics")
    .update({ default_appointment_type_id: typeId })
    .eq("id", clinicId);
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
    closes_at: "20:00",
  }));
  const { error } = await admin.from("working_hours").insert(rows);
  raiseIf(error);
}

async function listedSlots(
  signedIn: SupabaseClient,
  slug: string,
  dentistId: string,
  day: string,
): Promise<string[]> {
  const listed = await signedIn.rpc("get_available_slots", {
    slug,
    dentist_id: dentistId,
    day,
  });
  raiseIf(listed.error);
  return slotStarts(listed.data);
}

async function hiddenSlots(
  anon: SupabaseClient,
  slug: string,
  dentistId: string,
  day: string,
): Promise<void> {
  const listed = await anon.rpc("get_available_slots", {
    slug,
    dentist_id: dentistId,
    day,
  });
  if (listed.error !== null) {
    expect(listed.data).toBeNull();
    return;
  }
  expect(slotStarts(listed.data)).toEqual([]);
}

async function openSlots(
  patient: SupabaseClient,
  slug: string,
  dentistId: string,
): Promise<string[]> {
  for (let offset = 1; offset <= 7; offset += 1) {
    const picked = spaced(await listedSlots(patient, slug, dentistId, belgradeDay(offset)), slotCount);
    if (picked.length === slotCount) return picked;
  }
  throw new Error("slots");
}

async function book(
  patient: SupabaseClient,
  slug: string,
  dentistId: string,
  startsAt: string,
  phone: string,
): Promise<string> {
  const created = await patient.rpc("create_booking", {
    slug,
    dentist_id: dentistId,
    starts_at: startsAt,
    for_child: false,
    dependent_id: null,
    phone,
    date_of_birth: adultDateOfBirth,
    contact: null,
    reason: "kontrola",
  });
  raiseIf(created.error);
  return requestIdFrom(created.data);
}

async function readRequest(dentist: SupabaseClient, requestId: string): Promise<RequestRow> {
  const loaded = await dentist
    .from("booking_requests")
    .select(
      "id, account_id, appointment_id, patient_first_name, patient_last_name, patient_date_of_birth, patient_phone, booker_email, status, expires_at",
    )
    .eq("id", requestId)
    .single();
  raiseIf(loaded.error);
  return requestFrom(loaded.data);
}

async function readAppointments(
  dentist: SupabaseClient,
  requestId: string,
): Promise<AppointmentRow[]> {
  const loaded = await dentist
    .from("appointments")
    .select("id, status, starts_at, patient_id, cancelled_by")
    .eq("booking_request_id", requestId);
  raiseIf(loaded.error);
  return appointmentsFrom(loaded.data);
}

async function acceptRequest(
  dentist: SupabaseClient,
  clinicId: string,
  dentistId: string,
  request: RequestRow,
): Promise<string> {
  const chart = await dentist
    .from("patients")
    .insert({
      clinic_id: clinicId,
      first_name: request.firstName,
      last_name: request.lastName,
      slug: "ana-pacijent",
      email: request.email,
      phone: request.phone,
      date_of_birth: request.dateOfBirth,
    })
    .select("id")
    .single();
  raiseIf(chart.error);
  const patientId = textField(objectFrom(chart.data, "patients"), "id");

  const link = await dentist.from("patient_chart_links").insert({
    clinic_id: clinicId,
    patient_id: patientId,
    account_id: request.accountId,
    dependent_id: null,
  }).select("id").single();
  raiseIf(link.error);

  const scheduled = await dentist
    .from("appointments")
    .update({
      status: "scheduled",
      patient_id: patientId,
      confirmed_at: new Date().toISOString(),
      confirmed_by: dentistId,
    })
    .eq("id", request.appointmentId)
    .eq("clinic_id", clinicId)
    .eq("status", "pending_confirmation")
    .select("id")
    .maybeSingle();
  raiseIf(scheduled.error);
  if (scheduled.data === null) throw new Error("accept");

  const accepted = await dentist
    .from("booking_requests")
    .update({ status: "accepted", patient_id: patientId })
    .eq("id", request.id)
    .eq("clinic_id", clinicId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  raiseIf(accepted.error);
  if (accepted.data === null) throw new Error("accept");
  return patientId;
}

async function rejectRequest(dentist: SupabaseClient, clinicId: string, request: RequestRow): Promise<void> {
  const cancelled = await dentist
    .from("appointments")
    .update({ status: "cancelled", cancelled_by: "staff", cancellation_note: null })
    .eq("id", request.appointmentId)
    .eq("clinic_id", clinicId)
    .eq("status", "pending_confirmation")
    .select("id")
    .maybeSingle();
  raiseIf(cancelled.error);
  if (cancelled.data === null) throw new Error("reject");

  const rejected = await dentist
    .from("booking_requests")
    .update({ status: "rejected", patient_note: null })
    .eq("id", request.id)
    .eq("clinic_id", clinicId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  raiseIf(rejected.error);
  if (rejected.data === null) throw new Error("reject");
}

async function sendOffers(
  dentist: SupabaseClient,
  clinicId: string,
  request: RequestRow,
  dentistId: string,
  typeId: string,
  starts: string[],
): Promise<void> {
  for (const [index, startsAt] of starts.entries()) {
    const saved = await dentist
      .from("appointments")
      .insert({
        clinic_id: clinicId,
        dentist_id: dentistId,
        patient_id: null,
        booking_request_id: request.id,
        starts_at: startsAt,
        ends_at: plusMinutes(startsAt, 30),
        appointment_type_id: typeId,
        status: "offered",
        source: "staff",
      })
      .select("id")
      .single();
    raiseIf(saved.error);
    const appointmentId = textField(objectFrom(saved.data, "appointments"), "id");
    const linked = await dentist.from("appointment_offers").insert({
      booking_request_id: request.id,
      appointment_id: appointmentId,
      position: index + 1,
    }).select("appointment_id").single();
    raiseIf(linked.error);
  }
}

async function requestCount(admin: SupabaseClient, clinicId: string): Promise<number> {
  const loaded = await admin.from("booking_requests").select("id").eq("clinic_id", clinicId);
  raiseIf(loaded.error);
  return idsFrom(loaded.data, "id").length;
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
  if (created.patientEmail !== null) {
    const challenges = await admin.from("patient_email_challenges").delete().eq("email", created.patientEmail);
    raiseIf(challenges.error);
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

test("booking and offers", async () => {
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
  const phone = serbianPhone(suffix);
  const created: CreatedRows = { userIds: [], clinicId: null, patientEmail: null };

  try {
    const dentistEmail = `e2e-zahtev-${suffix}-dentist@example.com`;
    const patientEmail = `e2e-zahtev-${suffix}-patient@example.com`;
    created.patientEmail = patientEmail;
    const slug = `e2e-zahtev-${suffix}`;

    const dentistUserId = await createConfirmedUser(admin, dentistEmail, password);
    created.userIds.push(dentistUserId);
    const patientUserId = await createConfirmedUser(admin, patientEmail, password);
    created.userIds.push(patientUserId);

    const clinicId = await insertClinic(admin, slug);
    created.clinicId = clinicId;
    await insertType(admin, clinicId);
    const dentistId = await insertDentist(admin, clinicId, dentistUserId);
    await insertHours(admin, clinicId, dentistId);

    const typeRow = await admin
      .from("clinics")
      .select("default_appointment_type_id")
      .eq("id", clinicId)
      .single();
    raiseIf(typeRow.error);
    const typeId = textField(objectFrom(typeRow.data, "clinics"), "default_appointment_type_id");

    const anon = client(url, publishableKey);
    const patient = await signIn(url, publishableKey, patientEmail, password);
    const account = await patient.from("patient_accounts").insert({
      first_name: "Ana",
      last_name: "Pacijent",
      email: patientEmail,
      date_of_birth: adultDateOfBirth,
    }).select("id, email_confirmed_at").single();
    raiseIf(account.error);
    expect(objectFrom(account.data, "patient_accounts").email_confirmed_at).toBeNull();

    const slots = await openSlots(patient, slug, dentistId);
    const openDay = belgradeDay(1);
    await hiddenSlots(anon, slug, dentistId, fixtureDate);
    await hiddenSlots(anon, slug, dentistId, openDay);
    expect(await listedSlots(patient, slug, dentistId, openDay)).not.toEqual([]);

    const anonymousRequest = await anon.rpc("create_booking", {
      slug,
      dentist_id: dentistId,
      starts_at: fixtureStart,
      for_child: false,
      dependent_id: null,
      phone,
      date_of_birth: adultDateOfBirth,
      contact: null,
      reason: "kontrola",
    });
    expect(anonymousRequest.error).not.toBeNull();
    expect(await requestCount(admin, clinicId)).toBe(0);

    const unconfirmed = await patient.rpc("create_booking", {
      slug,
      dentist_id: dentistId,
      starts_at: slotAt(slots, 0),
      for_child: false,
      dependent_id: null,
      phone,
      date_of_birth: adultDateOfBirth,
      contact: null,
      reason: "kontrola",
    });
    expect(unconfirmed.error?.message ?? "").toContain("confirmed");
    expect(await requestCount(admin, clinicId)).toBe(0);

    const started = await patient.rpc("start_patient_email_challenge", {
      p_code_hash: await hashCode(confirmationCode),
      p_ip_hash: randomBytes(32).toString("hex"),
    });
    raiseIf(started.error);
    expect(statusOf(started.data, "start_patient_email_challenge")).toBe("ok");

    const confirmed = await patient.rpc("confirm_patient_email", { p_code: confirmationCode });
    raiseIf(confirmed.error);
    expect(statusOf(confirmed.data, "confirm_patient_email")).toBe("ok");

    const confirmedAccount = await patient.from("patient_accounts").select("email_confirmed_at").single();
    raiseIf(confirmedAccount.error);
    expect(typeof objectFrom(confirmedAccount.data, "patient_accounts").email_confirmed_at).toBe("string");

    const dentist = await signIn(url, publishableKey, dentistEmail, password);
    const acceptedId = await book(patient, slug, dentistId, slotAt(slots, 0), phone);
    const acceptedRequest = await readRequest(dentist, acceptedId);
    expect(acceptedRequest.status).toBe("pending");
    expect(acceptedRequest.dateOfBirth).toBe(adultDateOfBirth);
    expect(instant(acceptedRequest.expiresAt)).toBeGreaterThan(Date.now());
    const chartId = await acceptRequest(dentist, clinicId, dentistId, acceptedRequest);
    const acceptedAfter = await readRequest(dentist, acceptedId);
    expect(acceptedAfter.status).toBe("accepted");
    expect(acceptedAfter.accountId).not.toBe("");
    const acceptedHold = await dentist
      .from("appointments")
      .select("id, status, starts_at, patient_id, cancelled_by")
      .eq("id", acceptedRequest.appointmentId)
      .single();
    raiseIf(acceptedHold.error);
    const acceptedAppointment = appointmentsFrom([acceptedHold.data])[0];
    expect(acceptedAppointment?.status).toBe("scheduled");
    expect(acceptedAppointment?.patientId).toBe(chartId);
    expect(instant(acceptedAppointment?.startsAt ?? "")).toBe(instant(slotAt(slots, 0)));

    const rejectedId = await book(patient, slug, dentistId, slotAt(slots, 1), phone);
    const rejectedRequest = await readRequest(dentist, rejectedId);
    expect(rejectedRequest.dateOfBirth).toBe(adultDateOfBirth);
    await rejectRequest(dentist, clinicId, rejectedRequest);
    const rejectedAfter = await readRequest(dentist, rejectedId);
    expect(rejectedAfter.status).toBe("rejected");
    const rejectedHold = await dentist
      .from("appointments")
      .select("id, status, starts_at, patient_id, cancelled_by")
      .eq("id", rejectedRequest.appointmentId)
      .single();
    raiseIf(rejectedHold.error);
    const rejectedAppointment = appointmentsFrom([rejectedHold.data])[0];
    expect(rejectedAppointment?.status).toBe("cancelled");
    expect(rejectedAppointment?.cancelledBy).toBe("staff");

    const offerId = await book(patient, slug, dentistId, slotAt(slots, 2), phone);
    const offerRequest = await readRequest(dentist, offerId);
    expect(offerRequest.status).toBe("pending");
    expect(offerRequest.dateOfBirth).toBe(adultDateOfBirth);
    const offerStarts = slots.slice(3);
    expect(offerStarts).toHaveLength(3);
    await sendOffers(dentist, clinicId, offerRequest, dentistId, typeId, offerStarts);

    const offered = await readAppointments(dentist, offerId);
    expect(offered.filter((row) => row.status === "pending_confirmation")).toHaveLength(1);
    expect(offered.filter((row) => row.status === "offered")).toHaveLength(3);

    const offerToken = randomBytes(32).toString("hex");
    const link = await dentist.from("booking_links").insert({
      clinic_id: clinicId,
      booking_request_id: offerId,
      purpose: "offer",
      token_hash: offerToken,
      expires_at: offerRequest.expiresAt,
    }).select("id").single();
    raiseIf(link.error);

    const signedOut = await anon.rpc("preview_booking_offer", { p_token_hash: offerToken });
    raiseIf(signedOut.error);
    const signedOutBody = objectFrom(signedOut.data, "preview_booking_offer");
    expect(signedOutBody.status).toBe("signed_out");
    expect(signedOutBody.offers).toBeUndefined();

    const ready = await patient.rpc("preview_booking_offer", { p_token_hash: offerToken });
    raiseIf(ready.error);
    const readyBody = objectFrom(ready.data, "preview_booking_offer");
    expect(readyBody.status).toBe("ready");
    expect(slotStarts(readyBody.offers).map(instant).sort((left, right) => left - right)).toEqual(
      offerStarts.map(instant).sort((left, right) => left - right),
    );

    const declined = await patient.rpc("decline_offers", { token: offerToken });
    raiseIf(declined.error);
    const declinedRequest = await readRequest(dentist, offerId);
    expect(declinedRequest.status).toBe("declined_by_patient");
    const closed = await readAppointments(dentist, offerId);
    expect(closed).toHaveLength(4);
    expect(closed.every((row) => row.status === "cancelled" && row.cancelledBy === "patient")).toBe(true);

    const after = await patient.rpc("preview_booking_offer", { p_token_hash: offerToken });
    raiseIf(after.error);
    expect(statusOf(after.data, "preview_booking_offer")).toBe("declined");
  } finally {
    await removeCreated(admin, created);
  }
});
