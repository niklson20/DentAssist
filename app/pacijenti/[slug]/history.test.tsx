import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { appointmentStatusLabel } from "@/lib/labels";

import { groupVisitsByYear, VisitHistory, type VisitHistoryItem } from "./history";

const source = readFileSync(path.join(process.cwd(), "app/pacijenti/[slug]/history.tsx"), "utf8");

const visits: VisitHistoryItem[] = [
  {
    id: "visit-2025",
    status: "completed",
    dentist: "Dr Ana Anić",
    date: "2025-06-08",
  },
  {
    id: "visit-2026",
    status: "scheduled",
    dentist: "Dr Luka Lukić",
    date: "2026-06-08",
  },
];

describe("visit history", () => {
  it("keeps Supabase out of the history card", () => {
    expect(source.toLowerCase()).not.toContain("supabase");
  });

  it("groups visits by year with the newest first", () => {
    const groups = groupVisitsByYear(visits);

    expect(groups.map((group) => group.year)).toEqual(["2026", "2025"]);
    expect(groups[0]?.visits[0]?.date).toBe("2026-06-08");
    expect(groups[1]?.visits[0]?.date).toBe("2025-06-08");

    const html = renderToStaticMarkup(<VisitHistory visits={visits} />);
    const newer = html.indexOf("2026-06-08");
    const older = html.indexOf("2025-06-08");

    expect(newer).toBeGreaterThan(-1);
    expect(older).toBeGreaterThan(newer);
    expect(html.indexOf('data-year="2026"')).toBeLessThan(html.indexOf('data-year="2025"'));
    expect(html).toContain(appointmentStatusLabel("scheduled"));
    expect(html).toContain(appointmentStatusLabel("completed"));
    expect(html).toContain("Dr Luka Lukić");
    expect(html).toContain("Dr Ana Anić");
  });
});
