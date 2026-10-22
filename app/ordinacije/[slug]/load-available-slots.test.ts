import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    rpc: mocks.rpc,
  })),
}));

import { loadAvailableSlots } from "./load-available-slots";

beforeEach(() => {
  mocks.rpc.mockReset();
});

describe("loadAvailableSlots", () => {
  it("returns an empty list for invalid input", async () => {
    await expect(loadAvailableSlots("", "bad", "2026-03-01")).resolves.toEqual([]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("maps rpc rows into sorted iso timestamps", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ starts_at: "2026-03-01T14:30:00.000Z" }, { starts_at: "2026-03-01T08:00:00.000Z" }],
      error: null,
    });

    await expect(
      loadAvailableSlots(
        "ordinacija-centar",
        "11111111-1111-4111-8111-111111111111",
        "2026-03-01",
      ),
    ).resolves.toEqual(["2026-03-01T08:00:00.000Z", "2026-03-01T14:30:00.000Z"]);

    expect(mocks.rpc).toHaveBeenCalledWith("get_available_slots", {
      slug: "ordinacija-centar",
      dentist_id: "11111111-1111-4111-8111-111111111111",
      day: "2026-03-01",
    });
  });

  it("returns an empty list when the rpc fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "denied" } });
    await expect(
      loadAvailableSlots(
        "ordinacija-centar",
        "11111111-1111-4111-8111-111111111111",
        "2026-03-01",
      ),
    ).resolves.toEqual([]);
  });
});
