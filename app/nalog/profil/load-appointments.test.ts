import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    rpc: mocks.rpc,
    from: mocks.from,
  })),
}));

import { loadProfileAppointments, profileAppointmentsFrom } from "./load-appointments";

const earlier = {
  starts_at: "2026-04-15T08:30:00.000Z",
  ends_at: "2026-04-15T09:00:00.000Z",
  clinic_name: "Ordinacija A",
  dentist_first_name: "Mina",
  dentist_last_name: "Minić",
  status: "scheduled",
  reason: "Privatna napomena",
};

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.from.mockReset();
  mocks.from.mockImplementation(() => {
    throw new Error("direct table read");
  });
});

describe("loadProfileAppointments", () => {
  it("loads all account appointments and orders them chronologically", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          ...earlier,
          starts_at: "2026-05-01T10:00:00.000Z",
          ends_at: "2026-05-01T10:30:00.000Z",
          clinic_name: "Ordinacija B",
          status: "cancelled",
        },
        earlier,
      ],
      error: null,
    });

    await expect(loadProfileAppointments()).resolves.toEqual({
      ok: true,
      data: [
        {
          startsAt: earlier.starts_at,
          endsAt: earlier.ends_at,
          clinicName: "Ordinacija A",
          dentistName: "Mina Minić",
          status: "scheduled",
        },
        {
          startsAt: "2026-05-01T10:00:00.000Z",
          endsAt: "2026-05-01T10:30:00.000Z",
          clinicName: "Ordinacija B",
          dentistName: "Mina Minić",
          status: "cancelled",
        },
      ],
    });
    expect(mocks.rpc).toHaveBeenCalledWith("list_my_appointments_all");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("reports an unavailable list when the rpc is rejected", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501" } });

    await expect(loadProfileAppointments()).resolves.toEqual({
      ok: false,
      error: "Spisak trenutno nije dostupan. Pokušajte ponovo.",
    });
  });
});

describe("profileAppointmentsFrom", () => {
  it("drops rows with unknown statuses and private details", () => {
    const appointments = profileAppointmentsFrom([
      earlier,
      { ...earlier, status: "secret", clinic_name: "Tuđa ordinacija" },
    ]);

    expect(appointments).toEqual([
      {
        startsAt: earlier.starts_at,
        endsAt: earlier.ends_at,
        clinicName: "Ordinacija A",
        dentistName: "Mina Minić",
        status: "scheduled",
      },
    ]);
    expect(JSON.stringify(appointments)).not.toContain("Privatna napomena");
    expect(JSON.stringify(appointments)).not.toContain("Tuđa ordinacija");
  });
});
