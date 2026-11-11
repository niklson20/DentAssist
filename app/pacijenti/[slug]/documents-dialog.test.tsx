import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { parseBelgradeLocal } from "@/lib/calendar-dates";

vi.mock("@/app/actions/files", () => ({
  preparePatientFileUpload: vi.fn(),
  confirmPatientFile: vi.fn(),
  deletePatientFile: vi.fn(),
  openPatientFile: vi.fn(),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open?: boolean; children: ReactNode }) => (open ? <>{children}</> : null),
  DialogContent: ({ children }: { children: ReactNode }) => <div data-slot="dialog-content">{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogClose: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
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

function renderDocuments(
  now: Date,
  role: "owner" | "dentist" | "reception" = "owner",
  addOpen = false,
): string {
  return renderToStaticMarkup(
    <DocumentsDialog
      patientId={patientId}
      role={role}
      documents={[document]}
      now={now}
      addOpen={addOpen}
    />,
  );
}

describe("documents dialog", () => {
  it("lists documents on the chart panel without a file URL on 2026-06-08", () => {
    const html = renderDocuments(createdAt);

    expect(DAY).toBe("2026-06-08");
    expect(html).toContain("Snimak kutnjaka");
    expect(html).toContain("Pregled");
    expect(html).toContain("Preuzmi");
    expect(html).toContain("Dodaj dokument");
    expect(html).toContain("Sadržaj fajla se ne zamenjuje.");
    expect(html).not.toContain("Izaberite fajl");
    expect(html).not.toContain('type="file"');
    expect(html).not.toMatch(/https?:/);
    expect(html).not.toContain("patient-files");
    expect(dialogSource.toLowerCase()).not.toContain("supabase");
    expect(dialogSource).toContain("isDocumentLocked(");
    expect(dialogSource).toContain("ActionResult");
    expect(dialogSource).toContain("DialogContent");
    expect(dialogSource).toContain("Dodaj dokument");
    expect(dialogSource).toContain("Fajl je izabran:");
    expect(dialogSource).toContain("border-border");
    expect(dialogSource).toContain("text-destructive");
    expect(dialogSource).not.toContain("#");
  });

  it("opens the add-document modal with the upload form on 2026-06-08", () => {
    const html = renderDocuments(createdAt, "owner", true);

    expect(html).toContain("Novi dokument");
    expect(html).toContain("Naslov");
    expect(html).toContain("Kategorija");
    expect(html).toContain("Datum snimanja");
    expect(html).toContain("RTG");
    expect(html).toContain("Fotografija");
    expect(html).toContain("Nalaz/PDF");
    expect(html).toContain("Ostalo");
    expect(html).toContain("Izaberite fajl");
    expect(html).not.toContain("Fajl je izabran:");
    expect(html).toContain('accept="image/jpeg,image/png,image/webp,application/pdf"');
    expect(html).toContain(`max="${DAY}"`);
    expect(html).toContain('type="file"');
    expect(html.match(/type="file"/g)).toHaveLength(1);
    expect(html).not.toMatch(/https?:/);
  });

  it("lets the owner delete before the deadline on 2026-06-08", () => {
    const html = renderDocuments(createdAt);

    expect(html).toContain("Obriši");
    expect(html).toContain("Dodaj dokument");
    expect(html).not.toContain("izmena-dokumenta");
    expect(html).not.toContain("Sačuvaj");
    expect(html).not.toContain("Dokument je zaključan.");
    expect(html).not.toContain('type="file"');
  });

  it("does not allow delete after the deadline on 2026-06-08", () => {
    const html = renderDocuments(new Date(createdAt.getTime() + 24 * 60 * 60 * 1000));

    expect(html).toContain("Dokument je zaključan.");
    expect(html).toContain("Pregled");
    expect(html).toContain("Preuzmi");
    expect(html).toContain("Dodaj dokument");
    expect(html).not.toContain("izmena-dokumenta");
    expect(html).not.toContain("Sačuvaj");
    expect(html).not.toContain("Obriši");
    expect(html).not.toMatch(/https?:/);
    expect(html).not.toContain('type="file"');
  });

  it("shows nothing to reception and no URL on 2026-06-08", () => {
    const html = renderDocuments(createdAt, "reception");

    expect(html).toBe("");
    expect(html).not.toContain("Dokumenti");
    expect(html).not.toContain("Snimak kutnjaka");
    expect(html).not.toMatch(/https?:/);
    expect(html).not.toContain("patient-files");
  });
});
