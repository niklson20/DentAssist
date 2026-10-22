import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    rpc: mocks.rpc,
  })),
}));

import { loadClinicPublic } from "./load-clinic-public";

beforeEach(() => {
  mocks.rpc.mockReset();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
});

describe("loadClinicPublic", () => {
  it("returns unavailable for an empty slug", async () => {
    await expect(loadClinicPublic("   ")).resolves.toEqual({ status: "unavailable" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("maps the public rpc row", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          name: "Ordinacija Jovanović",
          slug: "ordinacija-jovanovic",
          city: "Beograd",
          address: "Knez Mihailova 1",
          phone: "+381111234567",
          logo_path: "clinic-id/logo.png",
          description: "Porodična stomatologija",
          dentists: [{ id: "11111111-1111-4111-8111-111111111111", first_name: "Ana", last_name: "Jović" }],
          max_ahead_days: 30,
          default_duration_min: 30,
        },
      ],
      error: null,
    });

    await expect(loadClinicPublic("ordinacija-jovanovic")).resolves.toEqual({
      status: "ready",
      clinic: {
        name: "Ordinacija Jovanović",
        slug: "ordinacija-jovanovic",
        city: "Beograd",
        address: "Knez Mihailova 1",
        phone: "+381111234567",
        description: "Porodična stomatologija",
        logoUrl: "https://example.supabase.co/storage/v1/object/public/clinic-logos/clinic-id/logo.png",
        dentists: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            firstName: "Ana",
            lastName: "Jović",
          },
        ],
        maxAheadDays: 30,
        defaultDurationMin: 30,
      },
    });
    expect(mocks.rpc).toHaveBeenCalledWith("get_clinic_public", { slug: "ordinacija-jovanovic" });
  });

  it("returns unavailable when the rpc fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(loadClinicPublic("missing")).resolves.toEqual({ status: "unavailable" });
  });
});
