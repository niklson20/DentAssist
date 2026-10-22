import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireOwner, loadStaffPage } = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  loadStaffPage: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireOwner }));
vi.mock("./load-staff", () => ({ loadStaffPage }));
vi.mock("./staff-page", () => ({
  StaffPage: () => <div data-testid="staff-page" />,
}));

import Page from "./page";

const pageSource = readFileSync(path.join(process.cwd(), "app/podesavanja/osoblje/page.tsx"), "utf8");
const clientSource = readFileSync(path.join(process.cwd(), "app/podesavanja/osoblje/staff-page.tsx"), "utf8");

beforeEach(() => {
  requireOwner.mockReset();
  loadStaffPage.mockReset();
  requireOwner.mockResolvedValue({
    userId: "10000000-0000-4000-8000-000000000002",
    clinicId: "11111111-1111-4111-8111-111111111111",
    role: "owner",
  });
});

describe("staff settings page", () => {
  it("keeps Supabase out of the page shell", () => {
    expect(pageSource.toLowerCase()).not.toContain("supabase");
    expect(clientSource.toLowerCase()).not.toContain("supabase");
    expect(clientSource).not.toContain("#");
  });

  it("renders the staff shell when data is ready", async () => {
    loadStaffPage.mockResolvedValue({
      status: "ready",
      ownerMemberId: "22222222-2222-4222-8222-222222222222",
      ownerPinSet: true,
      soleOwner: true,
      members: [],
      pendingInvites: [],
    });
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("Osoblje");
    expect(html).toContain('data-testid="staff-page"');
  });
});
