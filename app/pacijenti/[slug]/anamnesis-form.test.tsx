import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/patients", () => ({
  saveAnamnesis: vi.fn(),
}));

import { EMPTY_ANAMNESIS, normalizeAnamnesis } from "./anamnesis";
import { AnamnesisForm, AnamnesisView } from "./anamnesis-form";

const source = readFileSync(path.join(process.cwd(), "app/pacijenti/[slug]/anamnesis-form.tsx"), "utf8");

const filled = {
  chronicConditions: "Dijabetes",
  medications: "Aspirin",
  allergies: "Penicilin",
  pregnancy: "Ne",
};

describe("anamnesis form", () => {
  it("keeps Supabase out of the form", () => {
    expect(source.toLowerCase()).not.toContain("supabase");
    expect(source).toContain("saveAnamnesis");
    expect(source).toContain('name: "chronicConditions"');
    expect(source).toContain('name: "medications"');
    expect(source).toContain('name: "allergies"');
    expect(source).toContain('name: "pregnancy"');
  });

  it("shows saved anamnesis fields in the read-only view", () => {
    const html = renderToStaticMarkup(<AnamnesisView anamnesis={filled} />);
    expect(html).toContain("Hronične bolesti");
    expect(html).toContain("Dijabetes");
    expect(html).toContain("Lekovi");
    expect(html).toContain("Aspirin");
    expect(html).toContain("Alergije");
    expect(html).toContain("Penicilin");
    expect(html).toContain("Trudnoća");
    expect(html).toContain("Ne");
  });

  it("shows empty placeholders when anamnesis is blank", () => {
    const html = renderToStaticMarkup(<AnamnesisView anamnesis={EMPTY_ANAMNESIS} />);
    expect(html).toContain("—");
    expect(html).toContain("Hronične bolesti");
  });

  it("tolerates missing anamnesis fields without crashing", () => {
    expect(normalizeAnamnesis(undefined)).toEqual(EMPTY_ANAMNESIS);
    expect(normalizeAnamnesis({})).toEqual(EMPTY_ANAMNESIS);
    const html = renderToStaticMarkup(
      <AnamnesisView anamnesis={normalizeAnamnesis({ allergies: "Lateks" })} />,
    );
    expect(html).toContain("Lateks");
    expect(html).toContain("—");
  });

  it("renders an editable form with save and cancel", () => {
    const html = renderToStaticMarkup(
      <AnamnesisForm
        patientId="30000000-0000-4000-8000-000000000003"
        anamnesis={filled}
        onCancel={() => undefined}
        onSaved={() => undefined}
      />,
    );
    expect(html).toContain("Sačuvaj");
    expect(html).toContain("Otkaži");
    expect(html).toContain("Dijabetes");
    expect(html).toContain('name="patientId"');
  });
});
