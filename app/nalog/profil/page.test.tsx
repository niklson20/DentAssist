import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePatient: vi.fn(),
  loadProfileAppointments: vi.fn(),
  loadPatientName: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requirePatient: mocks.requirePatient }));
vi.mock("./load-appointments", () => ({
  loadProfileAppointments: mocks.loadProfileAppointments,
}));
vi.mock("./load-patient-name", () => ({ loadPatientName: mocks.loadPatientName }));
vi.mock("@/app/ordinacije/public-site-nav", () => ({
  PublicSiteNav: ({ children }: { children: ReactNode }) => <header>{children}</header>,
}));
vi.mock("@/app/ordinacije/public-site-footer", () => ({
  PublicSiteFooter: () => <footer />,
  publicSiteFooterClearance: "",
}));
vi.mock("@/app/ordinacije/[slug]/sign-out-button", () => ({
  PatientSignOutButton: () => <button>Odjava</button>,
}));
vi.mock("@/components/ui/button", () => ({
  buttonVariants: () => "",
}));

import PatientProfilePage from "./page";

beforeEach(() => {
  mocks.requirePatient.mockReset().mockResolvedValue({
    userId: "patient-user",
    accountId: "patient-account",
    email: "patient@example.com",
    emailConfirmedAt: "2026-10-22T10:00:00.000Z",
  });
  mocks.loadProfileAppointments.mockReset().mockResolvedValue({
    ok: true,
    data: [
      {
        appointmentId: "11111111-1111-4111-8111-111111111111",
        startsAt: "2026-04-15T08:30:00.000Z",
        endsAt: "2026-04-15T09:00:00.000Z",
        clinicName: "Ordinacija Centar",
        dentistName: "Mina Minić",
        status: "scheduled",
        clinicRating: null,
        dentistRating: null,
      },
    ],
  });
  mocks.loadPatientName.mockReset().mockResolvedValue({
    ok: true,
    data: { firstName: "Ana", lastName: "Anić" },
  });
});

describe("patient profile page", () => {
  it("requires a patient account and shows appointment status", async () => {
    const html = renderToStaticMarkup(await PatientProfilePage());

    expect(mocks.requirePatient).toHaveBeenCalledWith();
    expect(mocks.loadProfileAppointments).toHaveBeenCalledWith();
    expect(mocks.loadPatientName).toHaveBeenCalledWith("patient-account");
    expect(html).toContain("<h1 class=\"text-2xl font-semibold\">Ana Anić</h1>");
    expect(html).toContain("Najnoviji termini prikazani su prvi.");
    expect(html).toContain("Ordinacija Centar");
    expect(html).toContain("Mina Minić");
    expect(html).toContain("Zakazan");
    expect(html).not.toContain("scheduled");
  });

  it("renders a clear empty state", async () => {
    mocks.loadProfileAppointments.mockResolvedValue({ ok: true, data: [] });

    const html = renderToStaticMarkup(await PatientProfilePage());

    expect(html).toContain("Još nemate zakazanih termina.");
  });

  it("reports when patient name is unavailable", async () => {
    mocks.loadPatientName.mockResolvedValue({
      ok: false,
      error: "Ime i prezime trenutno nisu dostupni.",
    });

    const html = renderToStaticMarkup(await PatientProfilePage());

    expect(html).toContain("Ime i prezime trenutno nisu dostupni.");
    expect(html).toContain("<h1 class=\"text-2xl font-semibold\">Profil</h1>");
  });
});
