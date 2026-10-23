import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { needsDuplicateNameConfirmation, patientMatchesSearch } from "./search-schema";

const { requireMember, searchClinicPatients } = vi.hoisted(() => ({
  requireMember: vi.fn(),
  searchClinicPatients: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireMember }));
vi.mock("@/lib/queries/patients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/queries/patients")>();
  return {
    ...actual,
    searchClinicPatients,
    createPatientFromList: vi.fn(),
  };
});

import Page from "./page";

const pageSource = readFileSync(path.join(process.cwd(), "app/pacijenti/page.tsx"), "utf8");
const schemaSource = readFileSync(path.join(process.cwd(), "app/pacijenti/search-schema.ts"), "utf8");
const patientsSource = readFileSync(path.join(process.cwd(), "lib/queries/patients.ts"), "utf8");

beforeEach(() => {
  requireMember.mockReset();
  searchClinicPatients.mockReset();
  requireMember.mockResolvedValue({
    userId: "10000000-0000-4000-8000-000000000002",
    clinicId: "11111111-1111-4111-8111-111111111111",
    role: "owner",
  });
});

describe("patient list search schema", () => {
  it("matches phone and ignores jmbg", () => {
    const row = {
      firstName: "Mika",
      lastName: "Mikić",
      phone: "0612345678",
    };
    expect(patientMatchesSearch(row, "0612345678")).toBe(true);
    expect(
      patientMatchesSearch(
        { ...row, jmbg: "1234567890123" } as typeof row & { jmbg: string },
        "1234567890123",
      ),
    ).toBe(false);
    expect(schemaSource.toLowerCase()).not.toContain("jmbg");
    expect(patientsSource.toLowerCase()).not.toContain("jmbg");
  });

  it("requires confirmation before saving the same first and last name", () => {
    const existing = [{ firstName: "Ana", lastName: "Anić" }];
    expect(needsDuplicateNameConfirmation(existing, "Ana", "Anić")).toBe(true);
    expect(needsDuplicateNameConfirmation(existing, "Ana", "Mikić")).toBe(false);
    expect(pageSource).toContain("DUPLICATE_CONFIRMATION_REQUIRED");
    expect(pageSource).toContain("drugi pacijent sa istim imenom i prezimenom");
    expect(patientsSource).toContain("ActionResult");
    expect(pageSource.toLowerCase()).not.toContain("supabase");
    expect(pageSource).not.toContain("#");
    expect(pageSource).toContain("border-border");
    expect(pageSource).toContain("bg-card");
    expect(pageSource).toContain("text-destructive");
    expect(pageSource).toContain("text-primary");
  });
});

describe("patient list page", () => {
  it("keeps Supabase out of the page shell", async () => {
    expect(pageSource.toLowerCase()).not.toContain("supabase");
    searchClinicPatients.mockResolvedValue([]);
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ pretraga: "0612" }) }),
    );
    expect(html).toContain("Pacijenti");
    expect(searchClinicPatients).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", "0612");
  });

  it("renders search hits from the query layer", async () => {
    searchClinicPatients.mockResolvedValue([
      {
        id: "22222222-2222-4222-8222-222222222222",
        firstName: "Pera",
        lastName: "Perić",
        slug: "pera-peric",
        phone: "061111111",
      },
    ]);
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ pretraga: "061111" }) }),
    );
    expect(html).toContain("Pera Perić");
    expect(html).toContain("061111111");
  });

  it("shows duplicate confirmation when the server asks for it", async () => {
    searchClinicPatients.mockResolvedValue([]);
    const html = renderToStaticMarkup(
      await Page({
        searchParams: Promise.resolve({
          potvrdiIme: "1",
          ime: "Ana",
          prezime: "Anić",
        }),
      }),
    );
    expect(html).toContain("duplicateConfirmed");
    expect(html).toContain("drugi pacijent sa istim imenom i prezimenom");
  });
});
