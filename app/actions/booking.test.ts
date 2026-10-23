import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePatient: vi.fn(),
  loadClinicPublic: vi.fn(),
  loadSelfBooking: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requirePatient: mocks.requirePatient }));
vi.mock("@/app/ordinacije/[slug]/load-clinic-public", () => ({
  loadClinicPublic: mocks.loadClinicPublic,
}));
vi.mock("@/app/ordinacije/[slug]/zakazivanje/load-self-booking", () => ({
  loadSelfBooking: mocks.loadSelfBooking,
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.createClient }));

import { submitSelfBooking } from "./booking";

const dentistId = "11111111-1111-4111-8111-111111111111";
const startsAt = "2026-10-22T09:30:00.000Z";

const clinic = {
  name: "Ordinacija Centar",
  slug: "centar",
  city: "Beograd",
  address: "Ulica 1",
  phone: "011111",
  description: "",
  logoUrl: null,
  dentists: [],
  maxAheadDays: 14,
  defaultDurationMin: 30,
};

const profile = {
  firstName: "Ana",
  lastName: "Anić",
  phone: "+38160111222",
  email: "ana@example.com",
  dateOfBirth: "1990-01-01",
};

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

function identity(overrides: Record<string, string> = {}) {
  return form({
    slug: "centar",
    stomatolog: dentistId,
    pocetak: startsAt,
    reason: "Kontrola",
    firstName: "Ana",
    lastName: "Anić",
    dateOfBirth: "1990-01-01",
    phone: "060 111 222",
    email: "ana@example.com",
    consent: "yes",
    ...overrides,
  });
}

beforeEach(() => {
  mocks.requirePatient.mockReset();
  mocks.loadClinicPublic.mockReset();
  mocks.loadSelfBooking.mockReset();
  mocks.createClient.mockReset();
  mocks.requirePatient.mockResolvedValue({
    userId: "user-1",
    accountId: "account-1",
    email: "Ana@Example.com",
    emailConfirmedAt: "2026-10-22T10:00:00.000Z",
  });
  mocks.loadClinicPublic.mockResolvedValue({ status: "ready", clinic });
  mocks.loadSelfBooking.mockResolvedValue({
    status: "ready",
    selfLinked: false,
    profile,
  });
  mocks.createClient.mockResolvedValue({
    rpc: async () => ({ data: "99999999-9999-4999-8999-999999999999", error: null }),
  });
});

describe("submitSelfBooking", () => {
  it("accepts a confirmed account without a chart link", async () => {
    const result = await submitSelfBooking(null, identity());

    expect(result).toEqual({ ok: true, data: { status: "pending" } });
    expect(mocks.requirePatient).toHaveBeenCalledWith({
      purpose: "request",
      slug: "centar",
      stomatolog: dentistId,
      pocetak: startsAt,
    });
    expect(mocks.createClient).toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("Tuđi");
  });

  it("requires consent when identity is still entered", async () => {
    const data = identity();
    data.delete("consent");

    const result = await submitSelfBooking(null, data);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors?.consent).toEqual(["Prihvatite saglasnost."]);
    }
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("refuses a birth date under 15", async () => {
    const result = await submitSelfBooking(null, identity({ dateOfBirth: "2020-01-01" }));

    expect(result).toEqual({
      ok: false,
      error: "Osoba još nema 15 godina. Termin se zakazuje kao za dete, a uneti datum rođenja ostaje.",
    });
  });

  it("rejects an email that is not the account email", async () => {
    const result = await submitSelfBooking(null, identity({ email: "drugi@example.com" }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors?.email).toEqual(["Mejl je mejl ovog naloga."]);
    }
  });

  it("skips identity when the chart in this clinic is already linked", async () => {
    mocks.loadSelfBooking.mockResolvedValue({
      status: "ready",
      selfLinked: true,
      profile: { ...profile, firstName: "Tuđi" },
    });

    const result = await submitSelfBooking(
      null,
      form({
        slug: "centar",
        stomatolog: dentistId,
        pocetak: startsAt,
        reason: "",
      }),
    );

    expect(result).toEqual({ ok: true, data: { status: "pending" } });
    expect(JSON.stringify(result)).not.toContain("Tuđi");
  });

  it("does not let an unconfirmed email submit", async () => {
    mocks.requirePatient.mockRejectedValue(new Error("REDIRECT:/ordinacije/centar/registracija"));

    await expect(submitSelfBooking(null, identity())).rejects.toThrow(
      "REDIRECT:/ordinacije/centar/registracija",
    );
    expect(mocks.requirePatient).toHaveBeenCalledWith(expect.objectContaining({ purpose: "request" }));
    expect(mocks.loadSelfBooking).not.toHaveBeenCalled();
  });
});
