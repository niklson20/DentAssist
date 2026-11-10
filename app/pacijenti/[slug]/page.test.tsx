import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireMember, loadChildChart } = vi.hoisted(() => ({
  requireMember: vi.fn(),
  loadChildChart: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireMember }));
vi.mock("./load-child-chart", () => ({ loadChildChart }));
vi.mock("@phosphor-icons/react", () => {
  const Icon = () => <svg />;
  return { PencilSimple: Icon };
});

import Page from "./page";

const chart = {
  status: "ready" as const,
  patientId: "30000000-0000-4000-8000-000000000003",
  patient: {
    slug: "mika-mikic",
    firstName: "Mika",
    lastName: "Mikić",
    phone: null,
    email: null,
    dateOfBirth: "2015-01-01",
    sex: null,
    address: null,
    note: null,
    jmbg: null,
  },
  alerts: null,
  anamnesis: {
    chronicConditions: "",
    medications: "",
    allergies: "",
    pregnancy: "",
  },
  connect: {
    kind: "ready" as const,
    contacts: [{ id: "40000000-0000-4000-8000-000000000004", label: "Ana Anić · roditelj@example.com" }],
  },
  visits: [],
};

beforeEach(() => {
  requireMember.mockReset();
  loadChildChart.mockReset();
  requireMember.mockResolvedValue({
    userId: "user-1",
    clinicId: "clinic-1",
    role: "dentist",
  });
  loadChildChart.mockResolvedValue(chart);
});

describe("child chart link button", () => {
  it("shows Poveži sa roditeljem to a dentist and not to reception", async () => {
    const pageSource = readFileSync(path.join(process.cwd(), "app/pacijenti/[slug]/page.tsx"), "utf8");
    const buttonSource = readFileSync(
      path.join(process.cwd(), "app/pacijenti/[slug]/connect-parent-button.tsx"),
      "utf8",
    );
    expect(pageSource.toLowerCase()).not.toContain("supabase");
    expect(pageSource).toContain("visits={chart.visits}");
    expect(pageSource).not.toContain("visits={[]}");
    expect(buttonSource.toLowerCase()).not.toContain("supabase");

    const dentistHtml = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ slug: "mika-mikic" }) }),
    );
    expect(dentistHtml).toContain("Poveži sa roditeljem");
    expect(dentistHtml).toContain("Mika Mikić");

    requireMember.mockResolvedValue({
      userId: "user-2",
      clinicId: "clinic-1",
      role: "reception",
    });
    const receptionHtml = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ slug: "mika-mikic" }) }),
    );
    expect(receptionHtml).toContain("Mika Mikić");
    expect(receptionHtml).not.toContain("Poveži sa roditeljem");
  });
});
