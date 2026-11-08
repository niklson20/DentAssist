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

import { publicRatingSummariesFrom, searchDirectoryClinics } from "./public";

describe("publicRatingSummariesFrom", () => {
  it("maps clinic and dentist rating summaries", () => {
    const summaries = publicRatingSummariesFrom([
      {
        clinic_slug: "dentica",
        dentist_id: null,
        rating_average: 4.7,
        rating_count: 3,
      },
      {
        clinic_slug: "dentica",
        dentist_id: "11111111-1111-4111-8111-111111111111",
        rating_average: 4.8,
        rating_count: 6,
      },
    ]);

    expect(summaries.clinics.get("dentica")).toEqual({ average: 4.7, count: 3 });
    expect(summaries.dentists.get("dentica")?.get("11111111-1111-4111-8111-111111111111"))
      .toEqual({ average: 4.8, count: 6 });
  });
});

describe("searchDirectoryClinics", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    fromMock.mockClear();
    rpcMock.mockResolvedValueOnce({
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
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          clinic_slug: "dentica",
          dentist_id: null,
          rating_average: 4.7,
          rating_count: 3,
        },
      ],
      error: null,
    });
  });

  it("passes the near-me radius into the database query", async () => {
    const clinics = await searchDirectoryClinics({ lat: 44.8, lng: 20.47 });

    expect(rpcMock).toHaveBeenCalledWith(
      "search_clinics",
      expect.objectContaining({
        lat: 44.8,
        lng: 20.47,
        max_distance_km: 15,
      }),
    );
    expect(rpcMock).toHaveBeenCalledWith("get_public_rating_summaries", {
      p_slugs: ["dentica"],
    });
    expect(clinics[0].rating).toEqual({ average: 4.7, count: 3 });
  });
});
