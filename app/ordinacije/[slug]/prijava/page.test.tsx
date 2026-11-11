import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirect, loadClinicPublic, loadPatientAccess } = vi.hoisted(() => ({
  redirect: vi.fn((target: string) => {
    throw new Error(`REDIRECT:${target}`);
  }),
  loadClinicPublic: vi.fn(),
  loadPatientAccess: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("../load-clinic-public", () => ({ loadClinicPublic }));
vi.mock("./load-patient-session", () => ({ loadPatientAccess }));

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

beforeEach(() => {
  redirect.mockClear();
  loadClinicPublic.mockReset();
  loadPatientAccess.mockReset();
  loadClinicPublic.mockResolvedValue({ status: "ready", clinic });
  loadPatientAccess.mockResolvedValue({ status: "anonymous" });
});

describe("patient login page", () => {
  it("asks for email and password without Supabase and offers password reset", async () => {
    const pageSource = readFileSync(path.join(process.cwd(), "app/ordinacije/[slug]/prijava/page.tsx"), "utf8");
    const formSource = readFileSync(path.join(process.cwd(), "app/ordinacije/[slug]/prijava/login-form.tsx"), "utf8");
    expect(pageSource.toLowerCase()).not.toContain("supabase");
    expect(formSource.toLowerCase()).not.toContain("supabase");
    expect(formSource).toContain("Prijavi se");
    expect(formSource).toContain("Registracija");
    expect(formSource).toContain("Zaboravljena lozinka");
    expect(formSource).toContain('name="audience" value="patient"');
    expect(formSource).toContain('name="clinicSlug" value={slug}');
    expect(formSource).toContain("requestPasswordReset");
    expect(pageSource).toContain("LoginForm");
    expect(pageSource).toContain("clinicName={clinic.name}");

    await expect(
      Page({
        params: Promise.resolve({ slug: "centar" }),
        searchParams: Promise.resolve({}),
      }),
    ).resolves.toBeTruthy();
  });

  it("sends a confirmed patient back to the clinic", async () => {
    loadPatientAccess.mockResolvedValue({ status: "confirmed" });
    await expect(
      Page({
        params: Promise.resolve({ slug: "centar" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("REDIRECT:/ordinacije/centar");
  });

  it("sends an unconfirmed email to the code", async () => {
    loadPatientAccess.mockResolvedValue({ status: "unconfirmed", email: "ana@example.com" });
    await expect(
      Page({
        params: Promise.resolve({ slug: "centar" }),
        searchParams: Promise.resolve({
          stomatolog: "11111111-1111-4111-8111-111111111111",
          pocetak: "2026-10-22T09:30:00.000Z",
        }),
      }),
    ).rejects.toThrow(/REDIRECT:\/ordinacije\/centar\/registracija\?/);
  });
});
