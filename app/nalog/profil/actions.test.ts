import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePatient: vi.fn(),
  rpc: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requirePatient: mocks.requirePatient }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ rpc: mocks.rpc })),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { saveAppointmentReview } from "./actions";

beforeEach(() => {
  mocks.requirePatient.mockReset().mockResolvedValue({});
  mocks.rpc.mockReset().mockResolvedValue({ error: null });
  mocks.revalidatePath.mockReset();
});

describe("saveAppointmentReview", () => {
  it("requires a valid clinic score and submits the optional dentist score", async () => {
    const formData = new FormData();
    formData.set("appointmentId", "11111111-1111-4111-8111-111111111111");
    formData.set("clinicRating", "5");
    formData.set("dentistRating", "");

    await expect(saveAppointmentReview(null, formData)).resolves.toEqual({
      ok: true,
      data: undefined,
    });

    expect(mocks.requirePatient).toHaveBeenCalledWith({ purpose: "request" });
    expect(mocks.rpc).toHaveBeenCalledWith("submit_appointment_review", {
      p_appointment_id: "11111111-1111-4111-8111-111111111111",
      p_clinic_rating: 5,
      p_dentist_rating: null,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/nalog/profil");
  });

  it("rejects invalid scores before contacting the database", async () => {
    const formData = new FormData();
    formData.set("appointmentId", "11111111-1111-4111-8111-111111111111");
    formData.set("clinicRating", "6");
    formData.set("dentistRating", "");

    await expect(saveAppointmentReview(null, formData)).resolves.toEqual({
      ok: false,
      error: "Izaberite ocenu ordinacije od 1 do 5.",
    });
    expect(mocks.requirePatient).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("reports database failures instead of showing a successful save", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "P0001" } });
    const formData = new FormData();
    formData.set("appointmentId", "11111111-1111-4111-8111-111111111111");
    formData.set("clinicRating", "4");
    formData.set("dentistRating", "3");

    await expect(saveAppointmentReview(null, formData)).resolves.toEqual({
      ok: false,
      error: "Ocena trenutno ne može da se sačuva. Pokušajte ponovo.",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
