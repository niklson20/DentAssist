import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { JMBG_INVALID, parsePatientJmbg } from "./new-patient-schema";
import { needsDuplicateNameConfirmation, newPatientFormSchema, patientMatchesSearch } from "./search-schema";

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

import { NewPatientForm, type NewPatientDraft } from "./new-patient-dialog";
import Page from "./page";

const pageSource = readFileSync(path.join(process.cwd(), "app/pacijenti/page.tsx"), "utf8");
const dialogSource = readFileSync(path.join(process.cwd(), "app/pacijenti/new-patient-dialog.tsx"), "utf8");
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
    const searchFn = patientsSource.slice(
      patientsSource.indexOf("export async function searchClinicPatients"),
      patientsSource.indexOf("export async function listClinicPatientNames"),
    );
    expect(searchFn.toLowerCase()).not.toContain("jmbg");
  });

  it("keeps chart fields on the new patient form and rejects a future birth date", () => {
    const today = "2026-10-24";
    const parsed = newPatientFormSchema(today).safeParse({
      firstName: "Ana",
      lastName: "Anić",
      phone: "",
      dateOfBirth: "2015-06-01",
      sex: "female",
      email: "Ana@Example.com",
      address: "Ulica 1",
      note: "Beleška",
      duplicateConfirmed: false,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.email).toBe("ana@example.com");
      expect(parsed.data.phone).toBeNull();
      expect(parsed.data.sex).toBe("female");
    }
    const future = newPatientFormSchema(today).safeParse({
      firstName: "Ana",
      lastName: "Anić",
      phone: "",
      dateOfBirth: "2026-10-25",
      sex: "",
      email: "",
      address: "",
      note: "",
      duplicateConfirmed: false,
    });
    expect(future.success).toBe(false);
    expect(parsePatientJmbg("1234567890123")).toEqual({ ok: true, jmbg: "1234567890123" });
    expect(parsePatientJmbg("123")).toEqual({ ok: false, message: JMBG_INVALID });
    expect(parsePatientJmbg("")).toEqual({ ok: true, jmbg: null });
  });

  it("requires confirmation before saving the same first and last name", () => {
    const existing = [{ firstName: "Ana", lastName: "Anić" }];
    expect(needsDuplicateNameConfirmation(existing, "Ana", "Anić")).toBe(true);
    expect(needsDuplicateNameConfirmation(existing, "Ana", "Mikić")).toBe(false);
    expect(dialogSource).toContain("DUPLICATE_CONFIRMATION_REQUIRED");
    expect(dialogSource).toContain("drugi pacijent sa istim imenom i prezimenom");
    expect(patientsSource).toContain("ActionResult");
    expect(patientsSource).toContain("date_of_birth");
    expect(pageSource.toLowerCase()).not.toContain("supabase");
    expect(dialogSource.toLowerCase()).not.toContain("supabase");
    expect(pageSource).not.toContain("#");
    expect(dialogSource).not.toContain("#");
    expect(pageSource).toContain("border-border");
    expect(pageSource).toContain("bg-card");
    expect(dialogSource).toContain("text-destructive");
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
    expect(html).toContain("Novi pacijent");
    expect(html).not.toContain("Sačuvaj karton");
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

  it("shows duplicate confirmation when the server asks for it", () => {
    expect(pageSource).toContain('params.potvrdiIme === "1"');
    const html = renderForm({ needsDuplicateConfirmation: true });
    expect(html).toContain("duplicateConfirmed");
    expect(html).toContain("drugi pacijent sa istim imenom i prezimenom");
    expect(html).toContain("Datum rođenja");
    expect(html).toContain("Pol");
    expect(html).toContain("Mejl");
    expect(html).toContain("Adresa");
    expect(html).toContain("Beleška");
    expect(html).toContain("JMBG");
    expect(html).toContain("Sačuvaj karton");
    expect(html).toContain('value="Ana"');
  });

  it("hides JMBG from reception", () => {
    expect(pageSource).toContain('member.role === "owner" || member.role === "dentist"');
    const html = renderForm({}, false);
    expect(html).toContain("Datum rođenja");
    expect(html).not.toContain("JMBG");
    expect(html).not.toContain('name="jmbg"');
  });
});

function renderForm(draft: Partial<NewPatientDraft>, clinical = true): string {
  return renderToStaticMarkup(
    <NewPatientForm
      action={async () => ({ ok: true, data: { slug: "ana-anic" } })}
      clinical={clinical}
      today="2026-10-24"
      draft={{
        firstName: "Ana",
        lastName: "Anić",
        phone: "",
        dateOfBirth: "",
        sex: "",
        email: "",
        address: "",
        note: "",
        needsDuplicateConfirmation: false,
        error: "",
        ...draft,
      }}
    />,
  );
}
