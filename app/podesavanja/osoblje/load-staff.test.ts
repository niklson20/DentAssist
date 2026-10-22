import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createClient,
}));

import { loadStaffPage } from "./load-staff";

const clinicId = "11111111-1111-4111-8111-111111111111";
const userId = "10000000-0000-4000-8000-000000000002";
const ownerMemberId = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  mocks.createClient.mockReset();
  mocks.from.mockReset();
  mocks.rpc.mockReset();
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.createClient.mockResolvedValue({ from: mocks.from, rpc: mocks.rpc });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("loadStaffPage", () => {
  it("returns ready data for the signed-in owner", async () => {
    const membersOrder = vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({
        data: [
          {
            id: ownerMemberId,
            user_id: userId,
            role: "owner",
            first_name: "Ana",
            last_name: "Petrović",
            sees_patients: true,
            listed_online: true,
            unavailable: false,
          },
        ],
        error: null,
      }),
    });
    const invitesOrder = vi.fn().mockResolvedValue({
      data: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          email: "mila@example.com",
          role: "dentist",
          first_name: "Mila",
          last_name: "Jović",
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
          used_at: null,
          attempt_count: 0,
        },
      ],
      error: null,
    });
    mocks.from.mockImplementation((table: string) => {
      if (table === "clinic_members") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: membersOrder,
            }),
          }),
        };
      }
      if (table === "staff_invites") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                order: invitesOrder,
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    await expect(loadStaffPage(clinicId, userId)).resolves.toEqual({
      status: "ready",
      ownerMemberId,
      ownerPinSet: true,
      soleOwner: true,
      members: [
        {
          id: ownerMemberId,
          userId,
          role: "owner",
          firstName: "Ana",
          lastName: "Petrović",
          seesPatients: true,
          listedOnline: true,
          unavailable: false,
        },
      ],
      pendingInvites: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          email: "mila@example.com",
          role: "dentist",
          firstName: "Mila",
          lastName: "Jović",
          expiresAt: expect.any(String),
          attemptCount: 0,
        },
      ],
    });
  });

  it("stays unavailable when members cannot be read", async () => {
    mocks.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: null, error: { code: "42501" } }),
          }),
        }),
      }),
    });
    await expect(loadStaffPage(clinicId, userId)).resolves.toEqual({ status: "unavailable" });
  });
});
