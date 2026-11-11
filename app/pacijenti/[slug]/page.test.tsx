import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireMember, loadChildChart, listPatientFiles, loadCurrentMemberActor } = vi.hoisted(() => ({
  requireMember: vi.fn(),
  loadChildChart: vi.fn(),
  listPatientFiles: vi.fn(),
  loadCurrentMemberActor: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireMember }));
vi.mock("./load-child-chart", () => ({ loadChildChart }));
vi.mock("./load-tooth-chart", () => ({ loadCurrentMemberActor }));
vi.mock("@/app/actions/files", () => ({ listPatientFiles }));
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
  toothChart: {
    teeth: {},
    changes: [],
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
  listPatientFiles.mockReset();
  loadCurrentMemberActor.mockReset();
  requireMember.mockResolvedValue({
    userId: "user-1",
    clinicId: "clinic-1",
    role: "dentist",
  });
  loadChildChart.mockResolvedValue(chart);
  listPatientFiles.mockResolvedValue({ ok: true, data: { documents: [] } });
  loadCurrentMemberActor.mockResolvedValue("Ana Anić");
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
    expect(pageSource).toContain("listPatientFiles");
    expect(buttonSource.toLowerCase()).not.toContain("supabase");

    const dentistHtml = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ slug: "mika-mikic" }) }),
    );
    expect(dentistHtml).toContain("Poveži sa roditeljem");
    expect(dentistHtml).toContain("Mika Mikić");
    expect(dentistHtml).toContain("Dokumenti");
    expect(listPatientFiles).toHaveBeenCalledWith(chart.patientId);

    requireMember.mockResolvedValue({
      userId: "user-2",
      clinicId: "clinic-1",
      role: "reception",
    });
    listPatientFiles.mockClear();
    const receptionHtml = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ slug: "mika-mikic" }) }),
    );
    expect(receptionHtml).toContain("Mika Mikić");
    expect(receptionHtml).not.toContain("Poveži sa roditeljem");
    expect(receptionHtml).not.toContain("Dokumenti");
    expect(listPatientFiles).not.toHaveBeenCalled();
  });
});
