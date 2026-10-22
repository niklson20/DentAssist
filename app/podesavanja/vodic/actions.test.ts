import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireOwner, createSupabaseServerClient, writeGuideStepCookie } = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  writeGuideStepCookie: vi.fn(async () => undefined),
}));

vi.mock("@/lib/auth", () => ({ requireOwner }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("./guide-cookie", () => ({
  writeGuideStepCookie,
  clearGuideStepCookie: vi.fn(),
  readGuideStepCookie: vi.fn(),
}));
vi.mock("@/app/actions/settings", () => ({ geocodeAddress: vi.fn(async () => null) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { acceptGuideTerms, advanceGuideInvite } from "./actions";

const owner = { userId: "u1", clinicId: "c1", role: "owner" as const, memberId: "m1" };

beforeEach(() => {
  requireOwner.mockReset();
  createSupabaseServerClient.mockReset();
  writeGuideStepCookie.mockReset();
  requireOwner.mockResolvedValue(owner);
});

describe("guide actions", () => {
  it("accepts terms and advances the cookie", async () => {
    const is = vi.fn().mockResolvedValue({ error: null });
    const eq = vi.fn().mockReturnValue({ is });
    const update = vi.fn().mockReturnValue({ eq });
    createSupabaseServerClient.mockResolvedValue({
      from: vi.fn().mockReturnValue({ update }),
    });

    const result = await acceptGuideTerms(null, new FormData());
    expect(result.ok).toBe(true);
    expect(writeGuideStepCookie).toHaveBeenCalledWith("profile");
  });

  it("blocks invite advance when the owner does not see patients and no invite exists", async () => {
    createSupabaseServerClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "clinic_members") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: "m1", sees_patients: false },
                  }),
                }),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }),
    });

    const result = await advanceGuideInvite(null, new FormData());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("stomatologa");
    }
  });
});
