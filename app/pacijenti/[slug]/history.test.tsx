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
    note: {
      procedureDescription: "Plomba",
      recommendations: "Hladan oblog",
      treatmentPlan: "Kontrola za mesec dana",
      internalNotes: "Bez komplikacija",
    },
  },
  {
    id: "visit-2026",
    status: "scheduled",
    dentist: "Dr Luka Lukić",
    date: "2026-06-08",
  },
  {
    id: "visit-missing",
    status: "completed",
    dentist: "Dr Ana Anić",
    date: "2026-05-01",
    note: null,
  },
  {
    id: "visit-no-show",
    status: "no_show",
    dentist: "Dr Luka Lukić",
    date: "2026-04-01",
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
    expect(html).toContain("Status");
    expect(html).toContain("Stomatolog");
    expect(html).toContain("Datum");
    expect(html).toContain('role="row"');
  });

  it("shows the visit note only for completed appointments", () => {
    const html = renderToStaticMarkup(<VisitHistory visits={visits} />);

    expect(html).toContain("<details");
    expect(html).toContain("Opis zahvata");
    expect(html).toContain("Plomba");
    expect(html).toContain("Preporuke");
    expect(html).toContain("Hladan oblog");
    expect(html).toContain("Plan daljeg lečenja");
    expect(html).toContain("Kontrola za mesec dana");
    expect(html).toContain("Interne beleške");
    expect(html).toContain("Bez komplikacija");
    expect(html).toContain("Termin završen bez zapisa");
    expect(html.match(/<details/g)?.length).toBe(2);
    expect(html).toContain(appointmentStatusLabel("no_show"));
  });

  it("does not expose note controls when notes were not loaded", () => {
    const html = renderToStaticMarkup(
      <VisitHistory
        visits={[
          {
            id: "visit-plain",
            status: "completed",
            dentist: "Dr Ana Anić",
            date: "2025-06-08",
          },
        ]}
      />,
    );

    expect(html).not.toContain("<details");
    expect(html).not.toContain("Opis zahvata");
    expect(html).not.toContain("Termin završen bez zapisa");
  });
});
