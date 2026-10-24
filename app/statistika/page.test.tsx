import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  belgradeMonthRange,
  resolveStatisticsMonth,
} from "@/lib/queries/statistics";

const { requireOwner, loadClinicStatistics } = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  loadClinicStatistics: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireOwner }));
vi.mock("@/lib/queries/statistics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/queries/statistics")>();
  return {
    ...actual,
    loadClinicStatistics,
  };
});

import Page from "./page";

const pageSource = readFileSync(path.join(process.cwd(), "app/statistika/page.tsx"), "utf8");
const querySource = readFileSync(path.join(process.cwd(), "lib/queries/statistics.ts"), "utf8");

const clinicId = "11111111-1111-4111-8111-111111111111";
const dentistId = "22222222-2222-4222-8222-222222222222";
const fixedNow = new Date("2026-06-08T10:00:00+02:00");

beforeEach(() => {
  requireOwner.mockReset();
  loadClinicStatistics.mockReset();
  requireOwner.mockResolvedValue({ userId: "u1", clinicId, role: "owner" });
  vi.useFakeTimers();
  vi.setSystemTime(fixedNow);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("statistics month helpers", () => {
  it("defaults to the Belgrade calendar month on 2026-06-08", () => {
    expect(resolveStatisticsMonth(undefined, fixedNow)).toBe("2026-06");
    const { start, end } = belgradeMonthRange("2026-06");
    expect(start.toISOString()).toBe("2026-05-31T22:00:00.000Z");
    expect(end.toISOString()).toBe("2026-06-30T22:00:00.000Z");
  });
});

describe("statistics page", () => {
  it("keeps Supabase out of the page shell and has no export action", () => {
    expect(pageSource.toLowerCase()).not.toContain("supabase");
    expect(pageSource).not.toContain("Preuzmi izvoz");
    expect(pageSource).toContain("requireOwner");
    expect(pageSource).not.toContain("requireMember");
    expect(querySource).not.toContain("platform");
    expect(pageSource).toContain("border-border");
    expect(pageSource).toContain("bg-card");
    expect(pageSource).toContain("text-muted-foreground");
  });

  it("renders the owner table for the selected month", async () => {
    loadClinicStatistics.mockResolvedValue({
      status: "ready",
      month: "2026-05",
      rows: [
        {
          dentistId,
          name: "Mina Minić",
          appointments: 12,
          newPatients: 3,
          noShows: 1,
        },
      ],
    });

    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ mesec: "2026-05" }) }),
    );

    expect(requireOwner).toHaveBeenCalledOnce();
    expect(loadClinicStatistics).toHaveBeenCalledWith(clinicId, "2026-05");
    expect(html).toContain("Statistika");
    expect(html).toContain("Mina Minić");
    expect(html).toContain(">Novi pacijenti<");
    expect(html).toContain(">12<");
    expect(html).toContain(">3<");
    expect(html).toContain(">1<");
    expect(html).toContain('value="2026-05"');
    expect(html).not.toContain("Preuzmi izvoz");
  });

  it("shows unavailable state", async () => {
    loadClinicStatistics.mockResolvedValue({ status: "unavailable" });
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
    expect(loadClinicStatistics).toHaveBeenCalledWith(clinicId, "2026-06");
    expect(html).toContain("Podaci trenutno nisu dostupni");
  });
});
