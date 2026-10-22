import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headerGet: vi.fn(),
  createClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  rpc: vi.fn(),
  fetch: vi.fn(),
  requirePlatformAdmin: vi.fn(),
  sendMail: vi.fn(),
  revalidatePath: vi.fn(),
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

vi.mock("@/lib/auth", () => ({
  requirePlatformAdmin: mocks.requirePlatformAdmin,
}));

vi.mock("@/lib/mail", () => ({
  sendMail: mocks.sendMail,
  MailError: class MailError extends Error {
    readonly code: string;
    constructor(code: string) {
      super("sendMail failed");
      this.code = code;
    }
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

import {
  dismissClinicAccessRequest,
  loadClinicAccessFormContext,
  requestClinicAccess,
  sendClinicAccessInvite,
} from "./platform";

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

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const INVITE_ID = "22222222-2222-4222-8222-222222222222";

describe("sendClinicAccessInvite", () => {
  beforeEach(() => {
    vi.stubEnv("TOKEN_PEPPER", PEPPER);
    vi.stubEnv("STAFF_URL", "https://dent.example.com");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    mocks.requirePlatformAdmin.mockResolvedValue({ userId: "admin-user" });
    mocks.sendMail.mockResolvedValue(undefined);
    mocks.headerGet.mockImplementation((name: string) => {
      if (name === "host") {
        return "localhost:3000";
      }
      return null;
    });
    mocks.createClient.mockReturnValue({
      from: vi.fn(() => ({
        delete: vi.fn(() => ({
          eq: vi.fn(async () => ({ error: null })),
        })),
      })),
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("sends mail and links the request to the invite", async () => {
    const insert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => ({ data: { id: INVITE_ID }, error: null })),
      })),
    }));
    const update = vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: { id: REQUEST_ID }, error: null })),
          })),
        })),
      })),
    }));
    const from = vi.fn((table: string) => {
      if (table === "clinic_access_requests") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { id: REQUEST_ID, email: "nova@example.com", status: "pending" },
                error: null,
              })),
            })),
          })),
          update,
        };
      }
      if (table === "clinic_invites") {
        return { insert };
      }
      throw new Error(`unexpected table ${table}`);
    });
    mocks.createSupabaseServerClient.mockResolvedValue({ from });

    const result = await sendClinicAccessInvite(null, form({ requestId: REQUEST_ID }));

    expect(result).toEqual({ ok: true, data: { sent: true } });
    expect(mocks.sendMail).toHaveBeenCalledWith({
      to: "nova@example.com",
      subject: "Otvorite ordinaciju",
      text: expect.stringContaining("https://dent.example.com/poziv/"),
    });
    expect(update).toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/platforma");
  });

  it("does not link the request when mail fails", async () => {
    mocks.sendMail.mockRejectedValue(new Error("mail down"));
    const insert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => ({ data: { id: INVITE_ID }, error: null })),
      })),
    }));
    const update = vi.fn();
    const from = vi.fn((table: string) => {
      if (table === "clinic_access_requests") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { id: REQUEST_ID, email: "nova@example.com", status: "pending" },
                error: null,
              })),
            })),
          })),
          update,
        };
      }
      if (table === "clinic_invites") {
        return { insert };
      }
      throw new Error(`unexpected table ${table}`);
    });
    mocks.createSupabaseServerClient.mockResolvedValue({ from });

    const result = await sendClinicAccessInvite(null, form({ requestId: REQUEST_ID }));

    expect(result.ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});

describe("dismissClinicAccessRequest", () => {
  beforeEach(() => {
    mocks.requirePlatformAdmin.mockResolvedValue({ userId: "admin-user" });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("marks a pending request dismissed without sending mail", async () => {
    const update = vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: { id: REQUEST_ID }, error: null })),
          })),
        })),
      })),
    }));
    mocks.createSupabaseServerClient.mockResolvedValue({
      from: vi.fn(() => ({ update })),
    });

    const result = await dismissClinicAccessRequest(null, form({ requestId: REQUEST_ID }));

    expect(result).toEqual({ ok: true, data: { dismissed: true } });
    expect(mocks.sendMail).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/platforma");
  });
});
