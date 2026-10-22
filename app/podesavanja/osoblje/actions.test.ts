import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  sendMail: vi.fn(),
  hashInviteCode: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireOwner: mocks.requireOwner }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock("@/lib/mail", () => ({
  MailError: class MailError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
  sendMail: mocks.sendMail,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createClient,
}));
vi.mock("@/lib/clinic-invite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/clinic-invite")>();
  return {
    ...actual,
    hashInviteCode: mocks.hashInviteCode,
  };
});

import { sendStaffInvite, setMemberUnavailable, transferClinicOwnership } from "./actions";

const clinicId = "11111111-1111-4111-8111-111111111111";
const userId = "10000000-0000-4000-8000-000000000002";
const ownerMemberId = "22222222-2222-4222-8222-222222222222";

const cannedHash =
  "$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0c2FsdA$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

beforeEach(() => {
  vi.stubEnv("TOKEN_PEPPER", "pepper");
  vi.stubEnv("STAFF_URL", "https://dent.example.com");
  mocks.requireOwner.mockReset();
  mocks.createClient.mockReset();
  mocks.revalidatePath.mockReset();
  mocks.from.mockReset();
  mocks.rpc.mockReset();
  mocks.sendMail.mockReset();
  mocks.hashInviteCode.mockReset();
  mocks.requireOwner.mockResolvedValue({ userId, clinicId, role: "owner" });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.hashInviteCode.mockResolvedValue(cannedHash);
  mocks.sendMail.mockResolvedValue(undefined);
  mocks.createClient.mockResolvedValue({ from: mocks.from, rpc: mocks.rpc });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("sendStaffInvite", () => {
  it("requires a PIN before the first invite", async () => {
    mocks.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: ownerMemberId, sees_patients: true },
              error: null,
            }),
          }),
        }),
      }),
    });
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
    const result = await sendStaffInvite(
      null,
      form({
        firstName: "Mila",
        lastName: "Jović",
        email: "mila@example.com",
        role: "dentist",
      }),
    );
    expect(result).toEqual({
      ok: false,
      error: "Pre prve pozivnice postavite PIN na stranici Nalog.",
      fieldErrors: { pin: ["Pre prve pozivnice postavite PIN na stranici Nalog."] },
    });
  });
});

describe("setMemberUnavailable", () => {
  it("blocks the sole owner from becoming unavailable", async () => {
    const ownerSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: ownerMemberId, sees_patients: true },
            error: null,
          }),
        }),
      }),
    });
    const membersSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({
        data: [{ id: ownerMemberId, role: "owner" }],
        error: null,
      }),
    });
    mocks.from.mockImplementation((table: string) => {
      if (table === "clinic_members") {
        return { select: table === "clinic_members" ? ownerSelect : membersSelect };
      }
      return { select: membersSelect };
    });
    mocks.from.mockImplementation(() => ({
      select: vi.fn().mockImplementation((columns: string) => {
        if (columns.includes("sees_patients")) {
          return ownerSelect();
        }
        return membersSelect();
      }),
    }));

    const result = await setMemberUnavailable(
      null,
      form({ memberId: ownerMemberId, unavailable: "true" }),
    );
    expect(result).toEqual({
      ok: false,
      error: "Poslednji vlasnik ne može biti nedostupan dok ulogu ne preda drugom članu.",
    });
  });
});

describe("transferClinicOwnership", () => {
  it("rejects an empty target", async () => {
    const result = await transferClinicOwnership(null, form({ targetMemberId: "" }));
    expect(result.ok).toBe(false);
  });
});
