import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireOwner, loadLegalDataPage, loadSettingsPinGate } = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  loadLegalDataPage: vi.fn(),
  loadSettingsPinGate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireOwner }));
vi.mock("../load-pin-gate", () => ({ loadSettingsPinGate }));
vi.mock("./load-legal-data", () => ({ loadLegalDataPage }));
vi.mock("./legal-data-form", () => ({
  LegalDataForm: ({ fields }: { fields: { taxId: string } }) => (
    <div data-tax={fields.taxId}>Legal form</div>
  ),
}));

import Page from "./page";

const pageSource = readFileSync(
  path.join(process.cwd(), "app/podesavanja/pravni-podaci/page.tsx"),
  "utf8",
);
const formSource = readFileSync(
  path.join(process.cwd(), "app/podesavanja/pravni-podaci/legal-data-form.tsx"),
  "utf8",
);

const clinicId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  requireOwner.mockReset();
  loadLegalDataPage.mockReset();
  loadSettingsPinGate.mockReset();
  loadSettingsPinGate.mockResolvedValue({ status: "open" });
  requireOwner.mockResolvedValue({ userId: "u1", clinicId, role: "owner" });
});

describe("legal data page", () => {
  it("keeps Supabase out of the page and the form", () => {
    expect(pageSource.toLowerCase()).not.toContain("supabase");
    expect(formSource.toLowerCase()).not.toContain("supabase");
    expect(formSource).not.toContain("#");
  });

  it("renders loaded fields for the owner", async () => {
    loadLegalDataPage.mockResolvedValue({
      status: "ready",
      fields: { taxId: "123", registrationNumber: "", licenseNumber: "" },
    });
    const html = renderToStaticMarkup(await Page());
    expect(requireOwner).toHaveBeenCalledOnce();
    expect(html).toContain("Pravni podaci");
    expect(html).toContain('data-tax="123"');
  });

  it("shows unavailable state", async () => {
    loadLegalDataPage.mockResolvedValue({ status: "unavailable" });
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("Podaci trenutno nisu dostupni");
  });
});
