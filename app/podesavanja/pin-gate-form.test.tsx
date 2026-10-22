import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("./actions", () => ({ unlockSettingsPin: vi.fn() }));

import { SettingsPinForm } from "./pin-gate-form";
import { SettingsPinView } from "./pin-gate-screen";

describe("settings pin form", () => {
  it("asks the owner for a PIN", () => {
    const html = renderToStaticMarkup(<SettingsPinForm pinSet />);
    expect(html).toContain("PIN vlasnika");
    expect(html).toContain("Unesite PIN da otvorite podešavanja.");
    expect(html).toContain('name="pin"');
    expect(html).toContain("Otvori");
  });

  it("sends an owner without a PIN to the account page", () => {
    const html = renderToStaticMarkup(<SettingsPinForm pinSet={false} />);
    expect(html).toContain("Prvo postavite PIN na stranici");
    expect(html).toContain('href="/podesavanja/nalog"');
    expect(html).toContain("Nalog");
    expect(html).not.toContain('name="pin"');
  });

  it("shows that the gate cannot be read", () => {
    const html = renderToStaticMarkup(<SettingsPinView gate={{ status: "unavailable" }} />);
    expect(html).toContain("PIN trenutno nije dostupan. Pokušajte ponovo.");
    expect(html).not.toContain('name="pin"');
  });
});
