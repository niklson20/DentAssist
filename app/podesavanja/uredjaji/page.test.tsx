import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireOwner, loadDevicesPage } = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  loadDevicesPage: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireOwner }));
vi.mock("./load-devices", () => ({ loadDevicesPage }));
vi.mock("./devices-page", () => ({
  DevicesPage: ({ devices }: { devices: { id: string }[] }) => (
    <div data-count={devices.length}>Devices</div>
  ),
}));

import Page from "./page";

const pageSource = readFileSync(path.join(process.cwd(), "app/podesavanja/uredjaji/page.tsx"), "utf8");
const formSource = readFileSync(
  path.join(process.cwd(), "app/podesavanja/uredjaji/devices-page.tsx"),
  "utf8",
);

const clinicId = "11111111-1111-4111-8111-111111111111";
const deviceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

beforeEach(() => {
  requireOwner.mockReset();
  loadDevicesPage.mockReset();
  requireOwner.mockResolvedValue({ userId: "u1", clinicId, role: "owner" });
});

describe("devices page", () => {
  it("keeps Supabase out of the page and the form", () => {
    expect(pageSource.toLowerCase()).not.toContain("supabase");
    expect(formSource.toLowerCase()).not.toContain("supabase");
    expect(formSource).not.toContain("#");
  });

  it("renders loaded devices for the owner", async () => {
    loadDevicesPage.mockResolvedValue({
      status: "ready",
      thisBrowserLinked: false,
      devices: [{ id: deviceId, label: "Recepcija", createdAt: "2026-01-01T10:00:00Z", revokedAt: null }],
    });
    const html = renderToStaticMarkup(await Page());
    expect(requireOwner).toHaveBeenCalledOnce();
    expect(html).toContain("Uređaji");
    expect(html).toContain('data-count="1"');
  });

  it("shows unavailable state", async () => {
    loadDevicesPage.mockResolvedValue({ status: "unavailable" });
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("Podaci trenutno nisu dostupni");
  });
});
