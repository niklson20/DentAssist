import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireOwner: mocks.requireOwner }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ rpc: mocks.rpc })),
}));

import { loadClinicRatingDetails } from "./actions";

const dentistId = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  mocks.requireOwner.mockReset().mockResolvedValue({
    clinicId: "11111111-1111-4111-8111-111111111111",
  });
  mocks.rpc.mockReset().mockResolvedValue({
    data: [
      {
        appointment_id: "33333333-3333-4333-8333-333333333333",
        reviewer_name: "Mina Minić",
        dentist_name: "Marko Marković",
        clinic_rating: 5,
        dentist_rating: 4,
        starts_at: "2026-11-08T12:00:00.000Z",
        reviewed_at: "2026-11-08T12:30:00.000Z",
      },
    ],
    error: null,
  });
});

describe("loadClinicRatingDetails", () => {
  it("scopes rating details to the signed-in owner's clinic and selected dentist", async () => {
    await expect(loadClinicRatingDetails(dentistId)).resolves.toEqual({
      ok: true,
      data: [
        {
          appointmentId: "33333333-3333-4333-8333-333333333333",
          reviewerName: "Mina Minić",
          dentistName: "Marko Marković",
          clinicRating: 5,
          dentistRating: 4,
          startsAt: "2026-11-08T12:00:00.000Z",
          reviewedAt: "2026-11-08T12:30:00.000Z",
        },
      ],
    });

    expect(mocks.rpc).toHaveBeenCalledWith("get_clinic_rating_details", {
      p_clinic_id: "11111111-1111-4111-8111-111111111111",
      p_dentist_id: dentistId,
    });
  });

  it("rejects malformed dentist filters before querying", async () => {
    await expect(loadClinicRatingDetails("not-a-uuid")).resolves.toEqual({
      ok: false,
      error: "Ocene trenutno nisu dostupne. Pokušajte ponovo.",
    });
    expect(mocks.requireOwner).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("does not return successful results when the database rejects the request", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501" } });

    await expect(loadClinicRatingDetails(null)).resolves.toEqual({
      ok: false,
      error: "Ocene trenutno nisu dostupne. Pokušajte ponovo.",
    });
  });

  it("rejects unexpected empty database responses", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });

    await expect(loadClinicRatingDetails(null)).resolves.toEqual({
      ok: false,
      error: "Ocene trenutno nisu dostupne. Pokušajte ponovo.",
    });
  });

  it("returns no more than the five newest ratings", async () => {
    mocks.rpc.mockResolvedValue({
      data: Array.from({ length: 7 }, (_, index) => ({
        appointment_id: `33333333-3333-4333-8333-${String(index + 1).padStart(12, "0")}`,
        reviewer_name: `Pacijent ${index + 1}`,
        dentist_name: "Marko Marković",
        clinic_rating: 5,
        dentist_rating: 4,
        starts_at: "2026-11-08T12:00:00.000Z",
        reviewed_at: `2026-11-${String(8 - index).padStart(2, "0")}T12:30:00.000Z`,
      })),
      error: null,
    });

    const result = await loadClinicRatingDetails(null);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(5);
      expect(result.data[0].reviewerName).toBe("Pacijent 1");
      expect(result.data[4].reviewerName).toBe("Pacijent 5");
    }
  });
});
