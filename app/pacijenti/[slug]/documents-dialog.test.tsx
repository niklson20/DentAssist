import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { parseBelgradeLocal } from "@/lib/calendar-dates";

vi.mock("@/app/actions/files", () => ({
  preparePatientFileUpload: vi.fn(),
  confirmPatientFile: vi.fn(),
  updatePatientFile: vi.fn(),
  deletePatientFile: vi.fn(),
  openPatientFile: vi.fn(),
}));

import { DocumentsDialog } from "./documents-dialog";

const patientId = "22222222-2222-4222-8222-222222222222";
const fileId = "33333333-3333-4333-8333-333333333333";
const DAY = "2026-06-08";
const createdAt = parseBelgradeLocal(`${DAY}T10:00`);

const dialogSource = readFileSync(
  path.join(process.cwd(), "app/pacijenti/[slug]/documents-dialog.tsx"),
  "utf8",
);

const document = {
  id: fileId,
  title: "Snimak kutnjaka",
  category: "xray" as const,
  capturedOn: DAY,
  createdAt: createdAt.toISOString(),
  mimeType: "image/jpeg" as const,
  sizeBytes: 1200,
};

function renderDialog(now: Date, role: "owner" | "dentist" | "reception" = "owner"): string {
  return renderToStaticMarkup(
    <DocumentsDialog patientId={patientId} role={role} documents={[document]} now={now} open />,
  );
}

describe("documents dialog", () => {
  it("opens the document dialog without a file URL on 2026-06-08", () => {
    const html = renderDialog(createdAt);

    expect(DAY).toBe("2026-06-08");
    expect(html).toContain("Dokumenti");
    expect(html).toContain("Naslov");
    expect(html).toContain("Kategorija");
    expect(html).toContain("Datum snimanja");
    expect(html).toContain("RTG");
    expect(html).toContain("Fotografija");
    expect(html).toContain("Nalaz/PDF");
    expect(html).toContain("Ostalo");
    expect(html).toContain("Snimak kutnjaka");
    expect(html).toContain("Pregled");
    expect(html).toContain("Preuzmi");
    expect(html).toContain("Izaberite fajl");
    expect(html).not.toContain("Fajl je izabran.");
    expect(html).toContain('accept="image/jpeg,image/png,image/webp,application/pdf"');
    expect(html).toContain(`max="${DAY}"`);
    expect(html).toContain('type="file"');
    expect(html.match(/type="file"/g)).toHaveLength(1);
    expect(html).not.toMatch(/https?:/);
    expect(html).not.toContain("patient-files");
    expect(dialogSource.toLowerCase()).not.toContain("supabase");
    expect(dialogSource).toContain("isDocumentLocked(");
    expect(dialogSource).toContain("ActionResult");
    expect(dialogSource).toContain("border-border");
    expect(dialogSource).toContain("bg-card");
    expect(dialogSource).toContain("text-destructive");
    expect(dialogSource).not.toContain("#");
    expect(dialogSource).not.toContain("file.name");
  });

  it("lets the owner edit before the deadline on 2026-06-08", () => {
    const html = renderDialog(createdAt);

    expect(html).toContain("izmena-dokumenta");
    expect(html).toContain("Sačuvaj");
    expect(html).toContain("Obriši");
    expect(html).toContain("Dodaj");
    expect(html).not.toContain("Dokument je zaključan.");
    expect(html.match(/type="file"/g)).toHaveLength(1);
  });

  it("does not open the edit after the deadline on 2026-06-08", () => {
    const html = renderDialog(new Date(createdAt.getTime() + 24 * 60 * 60 * 1000));

    expect(html).toContain("Dokument je zaključan.");
    expect(html).toContain("Pregled");
    expect(html).toContain("Preuzmi");
    expect(html).toContain("Dodaj");
    expect(html).not.toContain("izmena-dokumenta");
    expect(html).not.toContain("Sačuvaj");
    expect(html).not.toContain("Obriši");
    expect(html).not.toMatch(/https?:/);
    expect(html.match(/type="file"/g)).toHaveLength(1);
  });

  it("shows nothing to reception and no URL on 2026-06-08", () => {
    const html = renderDialog(createdAt, "reception");

    expect(html).toBe("");
    expect(html).not.toContain("Dokumenti");
    expect(html).not.toContain("Snimak kutnjaka");
    expect(html).not.toMatch(/https?:/);
    expect(html).not.toContain("patient-files");
  });
});
