import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createClient,
}));

import { loadWorkingHoursPage } from "./load-working-hours";

const clinicId = "11111111-1111-4111-8111-111111111111";
const dentistMemberId = "33333333-3333-4333-8333-333333333333";
const dentistUserId = "10000000-0000-4000-8000-000000000003";

beforeEach(() => {
  mocks.from.mockReset();
  mocks.createClient.mockReset();
  mocks.createClient.mockResolvedValue({ from: mocks.from });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("loadWorkingHoursPage", () => {
  it("returns only the dentist own member id", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "clinic_members") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({
                    data: [
                      {
                        id: dentistMemberId,
                        user_id: dentistUserId,
                        first_name: "Ana",
                        last_name: "Ivić",
                        sees_patients: true,
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "working_hours") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const loaded = await loadWorkingHoursPage(clinicId, dentistUserId, "dentist", undefined);
    expect(loaded.status).toBe("ready");
    if (loaded.status === "ready") {
      expect(loaded.canPickDentist).toBe(false);
      expect(loaded.selectedMemberId).toBe(dentistMemberId);
      expect(loaded.days).toHaveLength(7);
    }
  });
});
