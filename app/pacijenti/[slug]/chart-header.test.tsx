import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ChartHeader } from "./chart-header";

const headerSource = readFileSync(
  path.join(process.cwd(), "app/pacijenti/[slug]/chart-header.tsx"),
  "utf8",
);

const patient = {
  firstName: "Mika",
  lastName: "Mikić",
  phone: "061 111 2222",
  dateOfBirth: "2015-06-01",
  sex: "male" as const,
  address: "Knez Mihailova 1",
  note: "Redovne kontrole.",
  jmbg: "1234567890123",
};

describe("chart header", () => {
  it("keeps Supabase out of the chart header", () => {
    expect(headerSource.toLowerCase()).not.toContain("supabase");
  });

  it("shows four tabs, warning, and JMBG to clinical staff", () => {
    const html = renderToStaticMarkup(
      <ChartHeader
        patient={patient}
        clinical
        alerts={[{ code: "drug_allergy", note: "Penicilin" }]}
      />,
    );
    expect(html).toContain("Mika Mikić");
    expect(html).toContain("Telefon");
    expect(html).toContain("061 111 2222");
    expect(html).toContain("Penicilin");
    expect(html).toContain("Alergija na lek");
    expect(html).toContain("Pregled");
    expect(html).toContain("Istorija");
    expect(html).toContain("Anamneza");
    expect(html).toContain("Zubi");
    expect(html).toContain("JMBG");
    expect(html).toContain("1234567890123");
    expect(html).toContain("Muški");
    expect(html).toContain("Knez Mihailova 1");
    expect(html).toContain("Redovne kontrole.");
  });

  it("shows Pregled and Istorija only to reception, without warning or JMBG", () => {
    const html = renderToStaticMarkup(
      <ChartHeader patient={{ ...patient, jmbg: null }} clinical={false} alerts={null} />,
    );
    expect(html).toContain("Pregled");
    expect(html).toContain("Istorija");
    expect(html).not.toContain("Anamneza");
    expect(html).not.toContain("Zubi");
    expect(html).not.toContain("JMBG");
    expect(html).not.toContain("Alergija na lek");
    expect(html).not.toContain("Penicilin");
  });
});
