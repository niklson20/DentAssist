import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireMember, loadWorkingHoursPage } = vi.hoisted(() => ({
  requireMember: vi.fn(),
  loadWorkingHoursPage: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireMember }));
vi.mock("./load-working-hours", () => ({ loadWorkingHoursPage }));
vi.mock("./working-hours-form", () => ({
  WorkingHoursForm: ({
    canPickDentist,
    selectedMemberId,
  }: {
    canPickDentist: boolean;
    selectedMemberId: string;
  }) => (
    <div data-can-pick={canPickDentist ? "yes" : "no"} data-member={selectedMemberId}>
      Form
    </div>
  ),
}));

import Page from "./page";

const pageSource = readFileSync(path.join(process.cwd(), "app/podesavanja/radno-vreme/page.tsx"), "utf8");
const formSource = readFileSync(
  path.join(process.cwd(), "app/podesavanja/radno-vreme/working-hours-form.tsx"),
  "utf8",
);

const memberId = "22222222-2222-4222-8222-222222222222";
const clinicId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  requireMember.mockReset();
  loadWorkingHoursPage.mockReset();
  requireMember.mockResolvedValue({
    userId: "10000000-0000-4000-8000-000000000002",
    clinicId,
    role: "owner",
  });
});

describe("working hours page", () => {
  it("keeps Supabase out of the page and the form", () => {
    expect(pageSource.toLowerCase()).not.toContain("supabase");
    expect(formSource.toLowerCase()).not.toContain("supabase");
    expect(formSource).not.toContain("#");
  });

  it("lets the owner pick a dentist schedule", async () => {
    loadWorkingHoursPage.mockResolvedValue({
      status: "ready",
      role: "owner",
      canPickDentist: true,
      dentists: [{ id: memberId, firstName: "Ana", lastName: "Ivić" }],
      selectedMemberId: memberId,
      days: [],
    });
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
    expect(requireMember).toHaveBeenCalledOnce();
    expect(html).toContain('data-can-pick="yes"');
    expect(html).toContain("Radno vreme");
  });

  it("shows only the dentist own schedule", async () => {
    requireMember.mockResolvedValue({
      userId: "10000000-0000-4000-8000-000000000003",
      clinicId,
      role: "dentist",
    });
    loadWorkingHoursPage.mockResolvedValue({
      status: "ready",
      role: "dentist",
      canPickDentist: false,
      dentists: [{ id: memberId, firstName: "Ana", lastName: "Ivić" }],
      selectedMemberId: memberId,
      days: [],
    });
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('data-can-pick="no"');
  });
});
