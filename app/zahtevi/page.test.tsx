import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireMember, loadRequestSection, loadPatientEmailCharts } = vi.hoisted(() => ({
  requireMember: vi.fn(),
  loadRequestSection: vi.fn(),
  loadPatientEmailCharts: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (href: string) => {
    throw new Error(`REDIRECT:${href}`);
  },
  usePathname: () => "/zahtevi",
}));
vi.mock("@/lib/auth", () => ({ requireMember }));
vi.mock("@/app/actions/appointments", () => ({
  loadRequestSection,
  acceptRequest: vi.fn(async () => ({ ok: true, data: { id: "appointment" } })),
  rejectRequest: vi.fn(async () => ({ ok: true, data: { id: "appointment" } })),
}));
vi.mock("@/app/actions/patients", () => ({
  loadPatientEmailCharts,
}));

import type { RequestListItem } from "@/app/actions/appointments";
import { RequestHistoryList } from "@/app/zahtevi/request-history";

import Page from "./page";

const pageSource = readFileSync(path.join(process.cwd(), "app/zahtevi/page.tsx"), "utf8");

const pendingItem: RequestListItem = {
  id: "44444444-4444-4444-8444-444444444444",
  timeLabel: "10:00",
  name: "Ana Anić",
  dentistName: "Mina Minić",
  reason: "Kontrola",
  deadlineLabel: "24. okt, 10:00",
  needsChoice: false,
  rejectedBy: null,
  note: null,
};

beforeEach(() => {
  requireMember.mockReset();
  loadRequestSection.mockReset();
  loadPatientEmailCharts.mockReset();
  requireMember.mockResolvedValue({
    userId: "10000000-0000-4000-8000-000000000002",
    clinicId: "11111111-1111-4111-8111-111111111111",
    role: "owner",
  });
  loadPatientEmailCharts.mockResolvedValue([]);
  loadRequestSection.mockResolvedValue({
    ok: true,
    data: {
      section: "pending",
      page: 1,
      total: 1,
      counts: { pending: 1, accepted: 2, rejected: 3, expired: 4 },
      requests: [pendingItem],
    },
  });
});

describe("zahtevi page", () => {
  it("shows four sections with counts and pending by default, with accept", async () => {
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));

    expect(loadRequestSection).toHaveBeenCalledWith("pending", 1);
    expect(html).toContain("Na čekanju (1)");
    expect(html).toContain("Prihvaćeni (2)");
    expect(html).toContain("Otkazani (3)");
    expect(html).toContain("Istekli (4)");
    expect(html).toContain('href="/zahtevi"');
    expect(html).toContain('href="/zahtevi?sekcija=prihvaceni"');
    expect(html).toContain('href="/zahtevi?sekcija=odbijeni"');
    expect(html).toContain('href="/zahtevi?sekcija=istekli"');
    expect(html).toContain("Ana Anić");
    expect(html).toContain("Prihvati");
    expect(html).toContain("Odbij");
    expect(html).toContain('aria-current="page"');
    expect(loadPatientEmailCharts).toHaveBeenCalled();
  });

  it("opens accepted as read-only and skips email tasks", async () => {
    loadRequestSection.mockResolvedValue({
      ok: true,
      data: {
        section: "accepted",
        page: 1,
        total: 1,
        counts: { pending: 0, accepted: 1, rejected: 0, expired: 0 },
        requests: [{ ...pendingItem, needsChoice: true }],
      },
    });
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ sekcija: "prihvaceni" }) }),
    );

    expect(loadRequestSection).toHaveBeenCalledWith("accepted", 1);
    expect(loadPatientEmailCharts).not.toHaveBeenCalled();
    expect(html).toContain("Ana Anić");
    expect(html).toContain("Mina Minić");
    expect(html).toContain("Kontrola");
    expect(html).not.toContain("Prihvati");
    expect(html).not.toContain("Isti karton");
    expect(html).not.toContain("Poruka pacijentu");
    expect(html).not.toContain('name="odluka"');
    expect(html).not.toContain('name="poruka"');
  });

  it("pages a section of more than 20 and sends an oversized page back", async () => {
    loadRequestSection.mockResolvedValue({
      ok: true,
      data: {
        section: "rejected",
        page: 2,
        total: 25,
        counts: { pending: 0, accepted: 0, rejected: 25, expired: 0 },
        requests: [pendingItem],
      },
    });
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ sekcija: "odbijeni", stranica: "2" }) }),
    );

    expect(html).toContain("Strana 2 od 2");
    expect(html).toContain('href="/zahtevi?sekcija=odbijeni"');
    expect(html).not.toContain("stranica=3");

    loadRequestSection.mockResolvedValue({
      ok: true,
      data: {
        section: "rejected",
        page: 9,
        total: 25,
        counts: { pending: 0, accepted: 0, rejected: 25, expired: 0 },
        requests: [],
      },
    });
    await expect(Page({ searchParams: Promise.resolve({ sekcija: "odbijeni", stranica: "9" }) })).rejects.toThrow(
      "REDIRECT:/zahtevi?sekcija=odbijeni&stranica=2",
    );
    await expect(Page({ searchParams: Promise.resolve({ sekcija: "nema" }) })).rejects.toThrow("REDIRECT:/zahtevi");
  });

  it("keeps rejected and expired history without respond buttons", () => {
    const rejected = renderToStaticMarkup(
      <RequestHistoryList
        section="rejected"
        requests={[{ ...pendingItem, rejectedBy: "staff", note: "Pun termin" }]}
      />,
    );
    const fromPatient = renderToStaticMarkup(
      <RequestHistoryList
        section="rejected"
        requests={[{ ...pendingItem, rejectedBy: "patient", note: null }]}
      />,
    );
    const expired = renderToStaticMarkup(
      <RequestHistoryList section="expired" requests={[pendingItem]} />,
    );

    expect(rejected).toContain("Ordinacija");
    expect(rejected).toContain("Pun termin");
    expect(fromPatient).toContain("Pacijent");
    expect(expired).toContain("Odgovor do");
    expect(expired).toContain("24. okt, 10:00");
    expect(rejected).not.toContain("Prihvati");
    expect(rejected).not.toContain("Poruka pacijentu");
    expect(rejected).not.toContain('name="odluka"');
    expect(expired).not.toContain("Prihvati");
    expect(expired).not.toContain('name="poruka"');
    expect(pageSource).toContain("loadRequestSection");
    expect(pageSource).toContain('section === "pending"');
    expect(pageSource.toLowerCase()).not.toContain("supabase");
  });
});
