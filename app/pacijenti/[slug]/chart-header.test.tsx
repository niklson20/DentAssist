import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@phosphor-icons/react", () => {
  const Icon = () => <svg />;
  return { PencilSimple: Icon };
});

vi.mock("@/app/actions/files", () => ({
  preparePatientFileUpload: vi.fn(),
  confirmPatientFile: vi.fn(),
  deletePatientFile: vi.fn(),
  openPatientFile: vi.fn(),
}));

import { ChartHeader } from "./chart-header";

const headerSource = readFileSync(
  path.join(process.cwd(), "app/pacijenti/[slug]/chart-header.tsx"),
  "utf8",
);

const patient = {
  firstName: "Mika",
  lastName: "Mikić",
  phone: "061 111 2222",
  email: "mika@example.com",
  dateOfBirth: "2015-06-01",
  sex: "male" as const,
  address: "Knez Mihailova 1",
  note: "Redovne kontrole.",
  jmbg: "1234567890123",
};

describe("chart header", () => {
  it("keeps Supabase out of the chart header", () => {
    expect(headerSource.toLowerCase()).not.toContain("supabase");
    expect(headerSource).toContain("aria-selected:bg-primary");
    expect(headerSource).not.toContain("aria-pressed:bg-accent");
  });

  it("shows four tabs, warning, and JMBG to clinical staff", () => {
    const html = renderToStaticMarkup(
      <ChartHeader
        patient={patient}
        patientSlug="mika-mikic"
        patientId="30000000-0000-4000-8000-000000000003"
        clinical
        today="2026-11-05"
        visits={[]}
        role="dentist"
        documents={[]}
        documentsNow="2026-11-05T10:00:00.000Z"
        alerts={[{ code: "drug_allergy", note: "Penicilin" }]}
        anamnesis={{
          chronicConditions: "Astma",
          medications: "",
          allergies: "",
          pregnancy: "",
        }}
      />,
    );
    expect(html).toContain("Mika Mikić");
    expect(html).toContain("Telefon");
    expect(html).toContain("+381611112222");
    expect(html).toContain("Penicilin");
    expect(html).toContain("Alergija na lek");
    expect(html).toContain("Informacije");
    expect(html).toContain("Istorija");
    expect(html).toContain("Anamneza");
    expect(html).toContain("Zubi");
    expect(html).toContain("Dokumenti");
    expect(html).toContain('id="chart-tab-dokumenti"');
    expect(html).toContain('aria-controls="chart-panel-dokumenti"');
    expect(html).not.toContain('id="chart-panel-dokumenti"');
    expect(html).toContain('aria-label="Izmeni"');
    expect(html).not.toContain(">Izmeni<");
    expect(html).not.toContain("Sačuvaj");
    expect(headerSource).toContain("AnamnesisForm");
    expect(headerSource).toContain("AnamnesisView");
    expect(headerSource).toContain("DocumentsDialog");
    expect(html).toContain("Datum rođenja");
    expect(html).toContain("1. 6. 2015.");
    expect(html).toContain("JMBG");
    expect(html).toContain("1234567890123");
    expect(html).toContain("Muški");
    expect(html).toContain("mika@example.com");
    expect(html).toContain("Knez Mihailova 1");
    expect(html).toContain("Redovne kontrole.");
  });

  it("shows Informacije and Istorija only to reception, without warning or JMBG", () => {
    const html = renderToStaticMarkup(
      <ChartHeader
        patient={{ ...patient, jmbg: null }}
        patientSlug="mika-mikic"
        clinical={false}
        today="2026-11-05"
        visits={[]}
        role="reception"
        alerts={null}
      />,
    );
    expect(html).toContain("Informacije");
    expect(html).toContain("Istorija");
    expect(html).not.toContain("Anamneza");
    expect(html).not.toContain("Zubi");
    expect(html).not.toContain("Dokumenti");
    expect(html).not.toContain("JMBG");
    expect(html).not.toContain("Alergija na lek");
    expect(html).not.toContain("Penicilin");
  });
});
