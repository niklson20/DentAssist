import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirect, loadClinicPublic, loadAccountChildren } = vi.hoisted(() => ({
  redirect: vi.fn((target: string) => {
    throw new Error(`REDIRECT:${target}`);
  }),
  loadClinicPublic: vi.fn(),
  loadAccountChildren: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth", () => ({
  requirePatient: vi.fn(async () => ({
    userId: "user-1",
    accountId: "account-1",
    email: "roditelj@example.com",
    emailConfirmedAt: "2026-10-22T10:00:00.000Z",
  })),
}));
vi.mock("../load-clinic-public", () => ({ loadClinicPublic }));
vi.mock("./load-children", () => ({ loadAccountChildren }));

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

beforeEach(() => {
  redirect.mockClear();
  loadClinicPublic.mockReset();
  loadAccountChildren.mockReset();
  loadClinicPublic.mockResolvedValue({ status: "ready", clinic });
  loadAccountChildren.mockResolvedValue({
    status: "ready",
    children: [
      {
        id: "child-1",
        firstName: "Ana",
        lastName: "Anić",
        dateOfBirth: "2018-03-02",
        relationship: "mother",
      },
    ],
  });
});

describe("children page", () => {
  it("lists children already on the account and hides an unconfirmed chart name", async () => {
    const pageSource = readFileSync(path.join(process.cwd(), "app/ordinacije/[slug]/deca/page.tsx"), "utf8");
    const formSource = readFileSync(
      path.join(process.cwd(), "app/ordinacije/[slug]/deca/add-child-form.tsx"),
      "utf8",
    );
    expect(pageSource.toLowerCase()).not.toContain("supabase");
    expect(formSource.toLowerCase()).not.toContain("supabase");

    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ slug: "centar" }) }),
    );
    expect(html).toContain("Ana Anić");
    expect(html).toContain("Dodaj dete");
    expect(html).toContain("Ime sa kartona ordinacije pojavljuje se ovde tek kad potvrdite poziv.");
    expect(html).not.toContain("Mika");
    expect(html).not.toContain("Mikić");
  });
});
