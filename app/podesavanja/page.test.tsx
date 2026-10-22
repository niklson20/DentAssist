import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireMember } = vi.hoisted(() => ({
  requireMember: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireMember }));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import Page from "./page";

const member = { userId: "u1", clinicId: "c1" };

beforeEach(() => {
  requireMember.mockReset();
});

describe("settings page", () => {
  it("lists every section for the owner", async () => {
    requireMember.mockResolvedValue({ ...member, role: "owner" });
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("Odeljci ordinacije.");
    expect(html).toContain('href="/podesavanja/ordinacija"');
    expect(html).toContain('href="/podesavanja/osoblje"');
    expect(html).toContain('href="/podesavanja/radno-vreme"');
    expect(html).toContain('href="/podesavanja/tipovi"');
    expect(html).toContain('href="/podesavanja/uredjaji"');
    expect(html).toContain('href="/podesavanja/pravni-podaci"');
    expect(html).toContain('href="/podesavanja/nalog"');
  });

  it("lists only the account section for reception", async () => {
    requireMember.mockResolvedValue({ ...member, role: "reception" });
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("Vaš nalog.");
    expect(html).toContain('href="/podesavanja/nalog"');
    expect(html).not.toContain('href="/podesavanja/ordinacija"');
    expect(html).not.toContain('href="/podesavanja/osoblje"');
    expect(html).not.toContain('href="/podesavanja/radno-vreme"');
    expect(html).not.toContain('href="/podesavanja/tipovi"');
    expect(html).not.toContain('href="/podesavanja/uredjaji"');
    expect(html).not.toContain('href="/podesavanja/pravni-podaci"');
  });
});
