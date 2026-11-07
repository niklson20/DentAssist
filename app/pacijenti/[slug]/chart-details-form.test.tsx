import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ChartDetailsForm } from "./chart-details-form";

const formSource = readFileSync(
  path.join(process.cwd(), "app/pacijenti/[slug]/chart-details-form.tsx"),
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

describe("chart details form", () => {
  it("keeps Supabase out of the form", () => {
    expect(formSource.toLowerCase()).not.toContain("supabase");
  });

  it("lets clinical staff edit the name, birth date, and chart fields", () => {
    const html = renderToStaticMarkup(
      <ChartDetailsForm
        patient={patient}
        patientSlug="mika-mikic"
        clinical
        today="2026-11-05"
        onCancel={() => undefined}
        onSaved={() => undefined}
      />,
    );

    expect(html).toContain('name="firstName"');
    expect(html).toContain('value="Mika"');
    expect(html).toContain('name="lastName"');
    expect(html).toContain('value="Mikić"');
    expect(html).toContain('name="dateOfBirth"');
    expect(html).toContain('value="2015-06-01"');
    expect(html).toContain('name="phone"');
    expect(html).toContain('value="+381611112222"');
    expect(html).toContain('name="email"');
    expect(html).toContain('value="mika@example.com"');
    expect(html).toContain('name="sex"');
    expect(html).toContain('name="address"');
    expect(html).toContain('name="note"');
    expect(html).toContain('name="jmbg"');
    expect(html).toContain("1234567890123");
    expect(html).toContain("Sačuvaj");
    expect(html).toContain("Otkaži");
  });

  it("hides JMBG from reception", () => {
    const html = renderToStaticMarkup(
      <ChartDetailsForm
        patient={{ ...patient, jmbg: null }}
        patientSlug="mika-mikic"
        clinical={false}
        today="2026-11-05"
        onCancel={() => undefined}
        onSaved={() => undefined}
      />,
    );

    expect(html).toContain('name="firstName"');
    expect(html).toContain('name="sex"');
    expect(html).not.toContain("JMBG");
    expect(html).not.toContain('name="jmbg"');
  });
});
