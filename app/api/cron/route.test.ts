import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  sendMail: vi.fn(),
  due_reminders: vi.fn(async () => false),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/mail", () => ({
  sendMail: mocks.sendMail,
  due_reminders: mocks.due_reminders,
}));

import { GET } from "./route";

const SECRET = "cron-test-secret";
const SUPABASE_URL = "https://example.supabase.co";
const SERVICE_ROLE_KEY = "service-role-test-key";

const originalEnv = {
  CRON_SECRET: process.env.CRON_SECRET,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

describe("GET /api/cron", () => {
  const rpc = vi.fn(async () => ({ data: 0, error: null }));

  beforeEach(() => {
    process.env.CRON_SECRET = SECRET;
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE_KEY;
    rpc.mockClear();
    mocks.createClient.mockReset();
    mocks.createClient.mockReturnValue({ rpc });
    mocks.sendMail.mockReset();
    mocks.due_reminders.mockReset();
    mocks.due_reminders.mockImplementation(async () => false);
  });

  afterEach(() => {
    restoreEnv("CRON_SECRET", originalEnv.CRON_SECRET);
    restoreEnv("NEXT_PUBLIC_SUPABASE_URL", originalEnv.NEXT_PUBLIC_SUPABASE_URL);
    restoreEnv("SUPABASE_SERVICE_ROLE_KEY", originalEnv.SUPABASE_SERVICE_ROLE_KEY);
  });

  it("returns 401 without Authorization: Bearer CRON_SECRET", async () => {
    const headers = [
      undefined,
      "Basic cron-test-secret",
      "Bearer wrong-secret",
      "cron-test-secret",
    ];

    for (const authorization of headers) {
      const response = await GET(cronRequest(authorization));
      expect(response.status).toBe(401);
    }

    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(mocks.sendMail).not.toHaveBeenCalled();
    expect(mocks.due_reminders).not.toHaveBeenCalled();
  });

  it("calls expire and purge and does not send mail", async () => {
    const response = await GET(cronRequest(`Bearer ${SECRET}`));

    expect(response.status).toBe(200);
    expect(mocks.createClient).toHaveBeenCalledWith(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    expect(rpc).toHaveBeenNthCalledWith(1, "expire_booking_requests");
    expect(rpc).toHaveBeenNthCalledWith(2, "purge_booking_request_pii");
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(mocks.sendMail).not.toHaveBeenCalled();
    expect(mocks.due_reminders).toHaveBeenCalledTimes(1);
    expect(mocks.due_reminders).toHaveBeenCalledWith({ rpc });
  });

  it("returns 500 when due_reminders returns true", async () => {
    mocks.due_reminders.mockResolvedValueOnce(true);

    const response = await GET(cronRequest(`Bearer ${SECRET}`));

    expect(response.status).toBe(500);
    expect(rpc).toHaveBeenNthCalledWith(1, "expire_booking_requests");
    expect(rpc).toHaveBeenNthCalledWith(2, "purge_booking_request_pii");
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });
});

function cronRequest(authorization?: string): Request {
  const headers = new Headers();
  if (authorization) {
    headers.set("authorization", authorization);
  }
  return new Request("https://example.com/api/cron", { headers });
}

function restoreEnv(name: "CRON_SECRET" | "NEXT_PUBLIC_SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY", value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
