import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadClinicPublic, loadChildLinkPreview, requirePatient } = vi.hoisted(() => ({
  loadClinicPublic: vi.fn(),
  loadChildLinkPreview: vi.fn(),
  requirePatient: vi.fn(),
}));

vi.mock("../../load-clinic-public", () => ({ loadClinicPublic }));
vi.mock("./load-child-link", () => ({ loadChildLinkPreview }));
vi.mock("@/lib/auth", () => ({ requirePatient }));

import Page from "./page";

const clinic = {
  name: "Ordinacija Centar",
  slug: "centar",
  city: "Beograd",
  address: "Ulica 1",
  phone: "011111",
  description: "",
  logoUrl: null,
  dentists: [],
  maxAheadDays: 14,
  defaultDurationMin: 30,
};

const token = "abcdefghijklmnopqrstuvwxyz0123456789ABCDE";

beforeEach(() => {
  loadClinicPublic.mockReset();
  loadChildLinkPreview.mockReset();
  requirePatient.mockReset();
  loadClinicPublic.mockResolvedValue({ status: "ready", clinic });
  requirePatient.mockResolvedValue({
    userId: "user-1",
    accountId: "account-1",
    email: "roditelj@example.com",
    emailConfirmedAt: "2026-10-22T10:00:00.000Z",
  });
  loadChildLinkPreview.mockResolvedValue({ status: "open" });
});

describe("child link page", () => {
  it("asks for confirmation without the child name", async () => {
    const pageSource = readFileSync(
      path.join(process.cwd(), "app/ordinacije/[slug]/povezi/[token]/page.tsx"),
      "utf8",
    );
    const formSource = readFileSync(
      path.join(process.cwd(), "app/ordinacije/[slug]/povezi/[token]/confirm-form.tsx"),
      "utf8",
    );
    expect(pageSource.toLowerCase()).not.toContain("supabase");
    expect(formSource.toLowerCase()).not.toContain("supabase");

    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ slug: "centar", token }) }),
    );
    expect(html).toContain("Potvrdi");
    expect(html).toContain("Ime deteta videćete posle potvrde.");
    expect(html).not.toContain("Mika");
    expect(html).not.toContain("Mikić");
  });
});
