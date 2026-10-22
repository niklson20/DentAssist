import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireMember, loadOwnPinState } = vi.hoisted(() => ({
  requireMember: vi.fn(),
  loadOwnPinState: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireMember }));
vi.mock("./load-account", () => ({ loadOwnPinState }));

import Page from "./page";

const pageSource = readFileSync(path.join(process.cwd(), "app/podesavanja/nalog/page.tsx"), "utf8");
const formSource = readFileSync(path.join(process.cwd(), "app/podesavanja/nalog/account-forms.tsx"), "utf8");

beforeEach(() => {
  requireMember.mockReset();
  loadOwnPinState.mockReset();
  requireMember.mockResolvedValue({
    userId: "10000000-0000-4000-8000-000000000003",
    clinicId: "11111111-1111-4111-8111-111111111111",
    role: "reception",
  });
});

describe("account page", () => {
  it("keeps Supabase out of the page and the form", () => {
    expect(pageSource.toLowerCase()).not.toContain("supabase");
    expect(formSource.toLowerCase()).not.toContain("supabase");
    expect(formSource).not.toContain("#");
  });

  it("offers a password and a first PIN to every role", async () => {
    loadOwnPinState.mockResolvedValue("unset");
    const html = renderToStaticMarkup(await Page());
    expect(requireMember).toHaveBeenCalledOnce();
    expect(html).toContain("Lozinka");
    expect(html).toContain('name="password"');
    expect(html).toContain("Sačuvaj lozinku");
    expect(html).toContain('name="pin"');
    expect(html).toContain("Sačuvaj PIN");
    expect(html).not.toContain("PIN je sačuvan.");
  });

  it("shows a saved PIN without asking for it again", async () => {
    loadOwnPinState.mockResolvedValue("set");
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("PIN je sačuvan.");
    expect(html).toContain('name="password"');
    expect(html).not.toContain('name="pin"');
    expect(html).not.toContain("Sačuvaj PIN");
  });

  it("keeps the password form when the PIN state cannot be read", async () => {
    loadOwnPinState.mockResolvedValue("unavailable");
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("PIN trenutno nije dostupan. Pokušajte ponovo.");
    expect(html).toContain('name="password"');
    expect(html).not.toContain('name="pin"');
  });
});
