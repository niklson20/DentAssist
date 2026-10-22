import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireMember, loadGuide, loadSettingsPinGate } = vi.hoisted(() => ({
  requireMember: vi.fn(),
  loadGuide: vi.fn(),
  loadSettingsPinGate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireMember }));
vi.mock("./load-pin-gate", () => ({ loadSettingsPinGate }));
vi.mock("./vodic/load-guide", () => ({ loadGuide }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("./vodic/guide-wizard", () => ({
  GuideWizard: () => <div data-testid="guide-wizard">Vodič</div>,
}));
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
  loadGuide.mockReset();
  loadSettingsPinGate.mockReset();
  loadGuide.mockResolvedValue({ status: "complete" });
  loadSettingsPinGate.mockResolvedValue({ status: "open" });
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

  it("shows the guide for an owner while setup is incomplete", async () => {
    requireMember.mockResolvedValue({ ...member, role: "owner" });
    loadGuide.mockResolvedValue({
      status: "ready",
      step: "terms",
      ownerMemberId: "m1",
      ownerSeesPatients: false,
      ownerPinSet: false,
      someoneSeesPatients: false,
      pendingDentistInvite: false,
      clinic: {
        name: "Test",
        city: "Beograd",
        address: "",
        phone: "",
        slotMinutes: 30,
        bufferMinutes: 0,
        defaultDurationMin: 30,
        minNoticeMinutes: 120,
        maxAheadDays: 30,
        defaultTypeName: "Pregled",
      },
    });
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("Vodič");
    expect(html).not.toContain("Odeljci ordinacije.");
  });

  it("asks the owner for a PIN when the gate is locked", async () => {
    requireMember.mockResolvedValue({ ...member, role: "owner" });
    loadSettingsPinGate.mockResolvedValue({ status: "locked", pinSet: true });
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("PIN vlasnika");
    expect(html).toContain('name="pin"');
    expect(html).not.toContain('href="/podesavanja/ordinacija"');
    expect(loadGuide).not.toHaveBeenCalled();
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
