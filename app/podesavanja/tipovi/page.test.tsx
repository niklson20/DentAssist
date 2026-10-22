import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireOwner, loadAppointmentTypesPage } = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  loadAppointmentTypesPage: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireOwner }));
vi.mock("./load-appointment-types", () => ({ loadAppointmentTypesPage }));
vi.mock("./appointment-types-page", () => ({
  AppointmentTypesPage: ({ types }: { types: { id: string }[] }) => (
    <div data-count={types.length}>Types</div>
  ),
}));

import Page from "./page";

const pageSource = readFileSync(path.join(process.cwd(), "app/podesavanja/tipovi/page.tsx"), "utf8");
const formSource = readFileSync(
  path.join(process.cwd(), "app/podesavanja/tipovi/appointment-types-page.tsx"),
  "utf8",
);

const clinicId = "11111111-1111-4111-8111-111111111111";
const typeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

beforeEach(() => {
  requireOwner.mockReset();
  loadAppointmentTypesPage.mockReset();
  requireOwner.mockResolvedValue({ userId: "u1", clinicId, role: "owner" });
});

describe("appointment types page", () => {
  it("keeps Supabase out of the page and the form", () => {
    expect(pageSource.toLowerCase()).not.toContain("supabase");
    expect(formSource.toLowerCase()).not.toContain("supabase");
    expect(formSource).not.toContain("#");
  });

  it("renders loaded types for the owner", async () => {
    loadAppointmentTypesPage.mockResolvedValue({
      status: "ready",
      defaultTypeId: typeId,
      types: [{ id: typeId, name: "Pregled", sortOrder: 0, active: true }],
    });
    const html = renderToStaticMarkup(await Page());
    expect(requireOwner).toHaveBeenCalledOnce();
    expect(html).toContain("Tipovi");
    expect(html).toContain('data-count="1"');
  });

  it("shows unavailable state", async () => {
    loadAppointmentTypesPage.mockResolvedValue({ status: "unavailable" });
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("Podaci trenutno nisu dostupni");
  });
});
