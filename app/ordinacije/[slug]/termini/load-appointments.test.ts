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

import { appointmentsFrom, loadMyAppointments } from "./load-appointments";

const mine = {
  starts_at: "2026-04-15T08:30:00.000Z",
  ends_at: "2026-04-15T09:00:00.000Z",
  dentist_first_name: "Mina",
  dentist_last_name: "Minić",
  status: "scheduled",
  reason: "Bol u vilici",
  note: "tajni zapis",
  clinic_slug: "druga-ordinacija",
  procedure_description: "Vađenje",
};

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.from.mockReset();
  mocks.from.mockImplementation(() => {
    throw new Error("direct table read");
  });
});

describe("loadMyAppointments", () => {
  it("asks only this clinic and keeps time, dentist, and status", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          starts_at: "2026-05-01T10:00:00.000Z",
          ends_at: "2026-05-01T10:30:00.000Z",
          dentist_first_name: "Pera",
          dentist_last_name: "Perić",
          status: "cancelled",
        },
        mine,
      ],
      error: null,
    });

    const loaded = await loadMyAppointments("  Centar  ");

    expect(mocks.rpc).toHaveBeenCalledWith("list_my_appointments", { slug: "centar" });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(loaded).toEqual({
      ok: true,
      data: [
        {
          startsAt: "2026-04-15T08:30:00.000Z",
          endsAt: "2026-04-15T09:00:00.000Z",
          dentistName: "Mina Minić",
          status: "scheduled",
        },
        {
          startsAt: "2026-05-01T10:00:00.000Z",
          endsAt: "2026-05-01T10:30:00.000Z",
          dentistName: "Pera Perić",
          status: "cancelled",
        },
      ],
    });
    expect(JSON.stringify(loaded)).not.toContain("Bol u vilici");
    expect(JSON.stringify(loaded)).not.toContain("tajni zapis");
    expect(JSON.stringify(loaded)).not.toContain("druga-ordinacija");
    expect(JSON.stringify(loaded)).not.toContain("Vađenje");
  });

  it("does not call the database for a slug outside this clinic path", async () => {
    const loaded = await loadMyAppointments("../druga");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(loaded.ok).toBe(false);
  });

  it("returns no rows when the call is rejected", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    const loaded = await loadMyAppointments("centar");
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.error).toBe("Spisak trenutno nije dostupan. Pokušajte ponovo.");
    }
  });
});

describe("appointmentsFrom", () => {
  it("drops a row that is not an appointment status", () => {
    const appointments = appointmentsFrom([
      mine,
      {
        starts_at: "2026-04-16T08:30:00.000Z",
        ends_at: "2026-04-16T09:00:00.000Z",
        dentist_first_name: "Tuđ",
        dentist_last_name: "Stomatolog",
        status: "secret",
        reason: "nije moj razlog",
      },
    ]);

    expect(appointments.map((item) => item.dentistName)).toEqual(["Mina Minić"]);
    expect(JSON.stringify(appointments)).not.toContain("nije moj razlog");
    expect(JSON.stringify(appointments)).not.toContain("Tuđ");
  });
});
