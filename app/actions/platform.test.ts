import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headerGet: vi.fn(),
  createClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  rpc: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => mocks.headerGet(name) }),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

import { loadClinicAccessFormContext, requestClinicAccess } from "./platform";

const PEPPER = "test-pepper";
const IP = "203.0.113.10";
const IP_HASH = createHmac("sha256", PEPPER).update(IP).digest("hex");

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

function serviceCountMock(ipCount: number, emailCount = 0) {
  const from = vi.fn((table: string) => {
    if (table !== "clinic_access_requests") {
      throw new Error(`unexpected table ${table}`);
    }
    return {
      select: vi.fn(() => ({
        eq: vi.fn((column: string, value: string) => {
          if (column === "ip_hash" && value === IP_HASH) {
            return {
              gte: vi.fn(async () => ({ count: ipCount, error: null })),
            };
          }
          throw new Error(`unexpected eq ${column}`);
        }),
        ilike: vi.fn((column: string) => {
          if (column === "email") {
            return {
              gte: vi.fn(async () => ({ count: emailCount, error: null })),
            };
          }
          throw new Error(`unexpected ilike ${column}`);
        }),
      })),
    };
  });
  mocks.createClient.mockReturnValue({ from });
}

describe("loadClinicAccessFormContext", () => {
  beforeEach(() => {
    vi.stubEnv("TOKEN_PEPPER", PEPPER);
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site-key");
    mocks.headerGet.mockImplementation((name: string) => {
      if (name === "x-forwarded-for") {
        return IP;
      }
      return null;
    });
    mocks.createClient.mockReset();
    mocks.createSupabaseServerClient.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("requires Turnstile after ten submissions from the same network", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    serviceCountMock(10);

    const context = await loadClinicAccessFormContext();
    expect(context).toEqual({
      status: "ready",
      turnstileRequired: true,
      turnstileSiteKey: "site-key",
    });
  });
});

describe("requestClinicAccess", () => {
  beforeEach(() => {
    vi.stubEnv("TOKEN_PEPPER", PEPPER);
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    mocks.headerGet.mockImplementation((name: string) => {
      if (name === "x-forwarded-for") {
        return IP;
      }
      return null;
    });
    mocks.createSupabaseServerClient.mockResolvedValue({ rpc: mocks.rpc });
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    global.fetch = mocks.fetch as typeof fetch;
    serviceCountMock(0);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("stores a request through the public RPC", async () => {
    mocks.rpc.mockResolvedValue({ error: null });

    const result = await requestClinicAccess(
      null,
      form({ email: "nova@example.com", city: "Beograd" }),
    );

    expect(result).toEqual({ ok: true, data: { submitted: true } });
    expect(mocks.rpc).toHaveBeenCalledWith("request_clinic_access", {
      email: "nova@example.com",
      city: "Beograd",
      ip_hash: IP_HASH,
    });
  });

  it("shows the pending message when the email already waits", async () => {
    mocks.rpc.mockResolvedValue({
      error: { message: "a pending clinic access request already exists for this email" },
    });

    const result = await requestClinicAccess(
      null,
      form({ email: "ceka@example.com", city: "Novi Sad" }),
    );

    expect(result).toEqual({
      ok: false,
      error: "Zahtev sa ove adrese već čeka.",
      fieldErrors: { email: ["Zahtev sa ove adrese već čeka."] },
    });
  });

  it("blocks a fourth request from the same email in one hour", async () => {
    serviceCountMock(0, 3);

    const result = await requestClinicAccess(
      null,
      form({ email: "cetiri@example.com", city: "Niš" }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Previše zahteva");
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("requires Turnstile after ten network submissions", async () => {
    serviceCountMock(10);

    const result = await requestClinicAccess(
      null,
      form({ email: "robot@example.com", city: "Kragujevac" }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors?.turnstile?.[0]).toBe("Potvrdite da niste robot.");
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
