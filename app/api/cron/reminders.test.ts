import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseBelgradeLocal } from "@/lib/calendar-dates";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  send: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

vi.mock("resend", () => ({
  Resend: class Resend {
    emails = { send: mocks.send };
  },
}));

import { GET } from "./route";

const SECRET = "cron-test-secret";
const SUPABASE_URL = "https://example.supabase.co";
const SERVICE_ROLE_KEY = "service-role-test-key";
const APPOINTMENT_ID = "10000000-0000-4000-8000-000000000001";
const CLINIC_ID = "20000000-0000-4000-8000-000000000002";
const PATIENT_ID = "30000000-0000-4000-8000-000000000003";
const DENTIST_ID = "40000000-0000-4000-8000-000000000004";
const REQUEST_ID = "50000000-0000-4000-8000-000000000005";
const PATIENT_EMAIL = "ana@example.com";
const STARTS_AT = parseBelgradeLocal("2026-06-08T11:00").toISOString();

const originalEnv = {
  CRON_SECRET: process.env.CRON_SECRET,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  MAIL_FROM: process.env.MAIL_FROM,
};

describe("appointment reminders", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = SECRET;
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE_KEY;
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.MAIL_FROM = "ne-odgovaraj@example.com";
    mocks.createClient.mockReset();
    mocks.send.mockReset();
    mocks.send.mockResolvedValue({ data: { id: "email_1" }, error: null });
    vi.useFakeTimers({ toFake: ["Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    restoreEnv("CRON_SECRET", originalEnv.CRON_SECRET);
    restoreEnv("NEXT_PUBLIC_SUPABASE_URL", originalEnv.NEXT_PUBLIC_SUPABASE_URL);
    restoreEnv("SUPABASE_SERVICE_ROLE_KEY", originalEnv.SUPABASE_SERVICE_ROLE_KEY);
    restoreEnv("RESEND_API_KEY", originalEnv.RESEND_API_KEY);
    restoreEnv("MAIL_FROM", originalEnv.MAIL_FROM);
  });

  it("returns 401 without Authorization: Bearer CRON_SECRET", async () => {
    const response = await GET(cronRequest());

    expect(response.status).toBe(401);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("does not send the same 2026-06-08 reminder on the second call", async () => {
    vi.setSystemTime(parseBelgradeLocal("2026-06-08T09:30"));
    const db = reminderDatabase(parseBelgradeLocal("2026-06-06T10:00").toISOString());
    mocks.createClient.mockReturnValue(db.client);

    const first = await GET(cronRequest(`Bearer ${SECRET}`));

    expect(first.status).toBe(200);
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls.map((call) => call[0].to)).toEqual([PATIENT_EMAIL, PATIENT_EMAIL]);
    expect(mocks.send.mock.calls.map((call) => call[0].subject)).toEqual([
      "Podsetnik za sutra",
      "Termin je za dva sata",
    ]);
    expect(mocks.send.mock.calls[0]?.[0].text).toBe(
      "Sutra: 11:00, Mina Minić, Knez Mihailova 1. Telefon: 011123456.",
    );
    expect(mocks.send.mock.calls[1]?.[0].text).toBe(
      "Termin je u 11:00, Mina Minić. Promena se radi telefonom: 011123456.",
    );
    expect(db.reminders.map((row) => row.kind)).toEqual(["24h", "2h"]);

    mocks.send.mockClear();
    const second = await GET(cronRequest(`Bearer ${SECRET}`));

    expect(second.status).toBe(200);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(db.reminders).toHaveLength(2);
  });

  it("sends nothing on 2026-06-08 when the reminder moment had passed at confirmation", async () => {
    vi.setSystemTime(parseBelgradeLocal("2026-06-08T10:30"));
    const db = reminderDatabase(parseBelgradeLocal("2026-06-08T10:00").toISOString());
    mocks.createClient.mockReturnValue(db.client);

    const response = await GET(cronRequest(`Bearer ${SECRET}`));

    expect(response.status).toBe(200);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(db.reminders).toHaveLength(0);
  });
});

type Row = Record<string, unknown>;

function reminderDatabase(confirmedAt: string) {
  const reminders: Row[] = [];
  const tables: Record<string, Row[]> = {
    appointments: [
      {
        id: APPOINTMENT_ID,
        clinic_id: CLINIC_ID,
        patient_id: PATIENT_ID,
        dentist_id: DENTIST_ID,
        booking_request_id: REQUEST_ID,
        starts_at: STARTS_AT,
        confirmed_at: confirmedAt,
        created_at: confirmedAt,
        status: "scheduled",
      },
    ],
    clinics: [
      {
        id: CLINIC_ID,
        name: "Ordinacija Centar",
        address: "Knez Mihailova 1",
        phone: "011123456",
        email: "ordinacija@example.com",
      },
    ],
    clinic_members: [{ id: DENTIST_ID, clinic_id: CLINIC_ID, first_name: "Mina", last_name: "Minić" }],
    patients: [{ id: PATIENT_ID, clinic_id: CLINIC_ID, email: null }],
    booking_requests: [{ id: REQUEST_ID, clinic_id: CLINIC_ID, booker_email: PATIENT_EMAIL }],
    patient_contacts: [{ patient_id: PATIENT_ID, clinic_id: CLINIC_ID, email: "roditelj@example.com" }],
    appointment_reminders: reminders,
  };

  function from(table: string) {
    return {
      select() {
        const filters: Array<[string, unknown]> = [];
        const matches = () =>
          (tables[table] ?? []).filter((row) => filters.every(([column, value]) => row[column] === value));
        const builder = {
          eq(column: string, value: unknown) {
            filters.push([column, value]);
            return builder;
          },
          async maybeSingle() {
            return { data: matches()[0] ?? null, error: null };
          },
          async limit() {
            return { data: matches(), error: null };
          },
        };
        return builder;
      },
      async insert(row: Row) {
        if (table !== "appointment_reminders") return { error: { code: "unexpected" } };
        const duplicate = reminders.some(
          (item) => item.appointment_id === row.appointment_id && item.kind === row.kind,
        );
        if (duplicate) return { error: { code: "23505" } };
        reminders.push({ ...row });
        return { error: null };
      },
    };
  }

  return {
    reminders,
    client: {
      async rpc(name: string) {
        if (name === "expire_booking_requests" || name === "purge_booking_request_pii") {
          return { data: 0, error: null };
        }
        if (name !== "due_reminders") return { data: null, error: { code: "unknown" } };
        return {
          data: [
            { appointment_id: APPOINTMENT_ID, clinic_id: CLINIC_ID, kind: "24h", starts_at: STARTS_AT },
            { appointment_id: APPOINTMENT_ID, clinic_id: CLINIC_ID, kind: "2h", starts_at: STARTS_AT },
          ],
          error: null,
        };
      },
      from,
    },
  };
}

function cronRequest(authorization?: string): Request {
  const headers = new Headers();
  if (authorization) headers.set("authorization", authorization);
  return new Request("https://example.com/api/cron", { headers });
}

function restoreEnv(name: keyof typeof originalEnv, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
