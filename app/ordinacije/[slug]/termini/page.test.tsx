import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { formatBelgrade } from "@/lib/calendar-dates";

const { requirePatient, loadClinicPublic, loadMyAppointments } = vi.hoisted(() => ({
  requirePatient: vi.fn(async () => ({
    userId: "user-1",
    accountId: "account-1",
    email: "ana@example.com",
    emailConfirmedAt: "2026-10-22T10:00:00.000Z",
  })),
  loadClinicPublic: vi.fn(),
  loadMyAppointments: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requirePatient }));
vi.mock("../load-clinic-public", () => ({ loadClinicPublic }));
vi.mock("./load-appointments", () => ({ loadMyAppointments }));

import Page from "./page";

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

const startsAt = "2026-04-15T08:30:00.000Z";
const endsAt = "2026-04-15T09:00:00.000Z";

beforeEach(() => {
  requirePatient.mockClear();
  loadClinicPublic.mockReset();
  loadMyAppointments.mockReset();
  loadClinicPublic.mockResolvedValue({ status: "ready", clinic });
  loadMyAppointments.mockResolvedValue({
    ok: true,
    data: [
      {
        startsAt,
        endsAt,
        dentistName: "Mina Minić",
        status: "scheduled",
      },
    ],
  });
});

describe("appointments page", () => {
  it("shows time, dentist, and status for this clinic only", async () => {
    const pageSource = readFileSync(path.join(process.cwd(), "app/ordinacije/[slug]/termini/page.tsx"), "utf8");
    const listSource = readFileSync(
      path.join(process.cwd(), "app/ordinacije/[slug]/termini/appointments-list.tsx"),
      "utf8",
    );
    expect(pageSource.toLowerCase()).not.toContain("supabase");
    expect(listSource.toLowerCase()).not.toContain("supabase");
    expect(listSource).not.toContain("reason");
    expect(listSource).not.toContain("procedure_description");

    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ slug: "Centar" }) }));
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    const when = `${formatBelgrade(start, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })}, ${formatBelgrade(start, { hour: "2-digit", minute: "2-digit" })}–${formatBelgrade(end, {
      hour: "2-digit",
      minute: "2-digit",
    })}`;

    expect(loadClinicPublic).toHaveBeenCalledWith("Centar");
    expect(requirePatient).toHaveBeenCalledWith({ slug: "centar" });
    expect(loadMyAppointments).toHaveBeenCalledWith("centar");
    expect(html).toContain("Termini ovog naloga u ordinaciji Ordinacija Centar.");
    expect(html).toContain(when);
    expect(html).toContain("Mina Minić");
    expect(html).toContain("Zakazan");
    expect(html).not.toContain("scheduled");
    expect(html).not.toContain("Bol u vilici");
    expect(html).not.toContain("druga-ordinacija");
    expect(html).not.toContain("Tuđa Ordinacija");
  });

  it("does not open the list when the clinic is not this one", async () => {
    loadClinicPublic.mockResolvedValue({ status: "unavailable" });

    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ slug: "druga" }) }));

    expect(requirePatient).not.toHaveBeenCalled();
    expect(loadMyAppointments).not.toHaveBeenCalled();
    expect(html).toContain("Ova ordinacija nije dostupna za online zakazivanje.");
    expect(html).not.toContain("Mina Minić");
  });

  it("shows an empty list when this account has no appointments here", async () => {
    loadMyAppointments.mockResolvedValue({ ok: true, data: [] });

    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ slug: "centar" }) }));

    expect(html).toContain("Nemate termine u ovoj ordinaciji.");
    expect(html).not.toContain("Mina Minić");
    expect(html).not.toContain("Bol u vilici");
  });

  it("hides the list when appointments cannot be read", async () => {
    loadMyAppointments.mockResolvedValue({
      ok: false,
      error: "Spisak trenutno nije dostupan. Pokušajte ponovo.",
    });

    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ slug: "centar" }) }));

    expect(html).toContain("Spisak trenutno nije dostupan. Pokušajte ponovo.");
    expect(html).not.toContain("Mina Minić");
  });
});
