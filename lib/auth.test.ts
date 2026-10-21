import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirect, createClient } = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  createClient: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: createClient }));

import {
  getSessionKind,
  homePathFor,
  requireMember,
  requireOwner,
  requirePlatformAdmin,
} from "@/lib/auth";

type Fake = {
  user: { id: string } | null;
  clinicId?: string | null;
  role?: string | null;
  platform?: boolean;
  rpcError?: string;
};

function fakeClient(fake: Fake): SupabaseClient {
  return {
    auth: {
      getUser: async () =>
        fake.user
          ? { data: { user: fake.user }, error: null }
          : { data: { user: null }, error: { message: "no session" } },
    },
    rpc: async (name: string) => {
      if (fake.rpcError) {
        return { data: null, error: { message: fake.rpcError } };
      }
      const data =
        name === "current_clinic_id"
          ? (fake.clinicId ?? null)
          : name === "current_member_role"
            ? (fake.role ?? null)
            : (fake.platform ?? false);
      return { data, error: null };
    },
  } as unknown as SupabaseClient;
}

const owner: Fake = { user: { id: "u1" }, clinicId: "c1", role: "owner" };

beforeEach(() => {
  redirect.mockClear();
  createClient.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("requireMember", () => {
  it("returns the member with clinic and role", async () => {
    createClient.mockResolvedValue(fakeClient(owner));
    await expect(requireMember()).resolves.toEqual({ userId: "u1", clinicId: "c1", role: "owner" });
  });

  it("sends an anonymous visitor to /prijava", async () => {
    createClient.mockResolvedValue(fakeClient({ user: null }));
    await expect(requireMember()).rejects.toThrow("REDIRECT:/prijava");
  });

  it("sends a patient-only account to /prijava", async () => {
    createClient.mockResolvedValue(fakeClient({ user: { id: "p1" } }));
    await expect(requireMember()).rejects.toThrow("REDIRECT:/prijava");
  });

  it("sends the visitor to /prijava when the lookup fails", async () => {
    createClient.mockResolvedValue(fakeClient({ ...owner, rpcError: "boom" }));
    await expect(requireMember()).rejects.toThrow("REDIRECT:/prijava");
  });
});

describe("requireOwner", () => {
  it("lets the owner in", async () => {
    createClient.mockResolvedValue(fakeClient(owner));
    await expect(requireOwner()).resolves.toMatchObject({ role: "owner" });
  });

  it.each(["dentist", "reception"])("turns away a %s", async (role) => {
    createClient.mockResolvedValue(fakeClient({ ...owner, role }));
    await expect(requireOwner()).rejects.toThrow("REDIRECT:/prijava");
  });
});

describe("requirePlatformAdmin", () => {
  it("returns the platform admin", async () => {
    createClient.mockResolvedValue(fakeClient({ user: { id: "a1" }, platform: true }));
    await expect(requirePlatformAdmin()).resolves.toEqual({ userId: "a1" });
  });

  it("turns away staff who are not platform admins", async () => {
    createClient.mockResolvedValue(fakeClient(owner));
    await expect(requirePlatformAdmin()).rejects.toThrow("REDIRECT:/prijava");
  });

  it("turns away an anonymous visitor", async () => {
    createClient.mockResolvedValue(fakeClient({ user: null }));
    await expect(requirePlatformAdmin()).rejects.toThrow("REDIRECT:/prijava");
  });
});

describe("getSessionKind", () => {
  it("tells anonymous, staff, platform and patient apart", async () => {
    expect(await getSessionKind(fakeClient({ user: null }))).toBe("anonymous");
    expect(await getSessionKind(fakeClient(owner))).toBe("staff");
    expect(await getSessionKind(fakeClient({ user: { id: "a1" }, platform: true }))).toBe("platform");
    expect(await getSessionKind(fakeClient({ user: { id: "p1" } }))).toBe("patient");
  });

  it("reports a technical failure as unknown, not as a patient", async () => {
    expect(await getSessionKind(fakeClient({ ...owner, rpcError: "boom" }))).toBe("unknown");
  });
});

describe("homePathFor", () => {
  it("sends staff to /danas and platform to /platforma only", () => {
    expect(homePathFor("staff")).toBe("/danas");
    expect(homePathFor("platform")).toBe("/platforma");
    for (const kind of ["anonymous", "patient", "unknown"] as const) {
      expect(homePathFor(kind)).toBeNull();
    }
  });
});
