import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
const fromMock = vi.fn(() => ({
  getPublicUrl: vi.fn(() => ({ data: { publicUrl: "https://cdn.example/logo.png" } })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    rpc: rpcMock,
    storage: { from: fromMock },
  })),
}));

vi.mock("@/app/directory-href", () => ({
  directoryNearMeMaxDistanceKm: vi.fn(() => 15),
}));

import { searchDirectoryClinics } from "./public";

describe("searchDirectoryClinics", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    fromMock.mockClear();
    rpcMock.mockResolvedValue({
      data: [
        {
          name: "Dentica",
          address: "Kralja Petra 1",
          city: "Beograd",
          phone: "+381 11 123 4567",
          logo_path: null,
          slug: "dentica",
          distance_km: 4.2,
          latitude: 44.8,
          longitude: 20.47,
        },
      ],
      error: null,
    });
  });

  it("passes the near-me radius into the database query", async () => {
    await searchDirectoryClinics({ lat: 44.8, lng: 20.47 });

    expect(rpcMock).toHaveBeenCalledWith(
      "search_clinics",
      expect.objectContaining({
        lat: 44.8,
        lng: 20.47,
        max_distance_km: 15,
      }),
    );
  });
});
