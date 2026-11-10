import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { parseBelgradeLocal } from "@/lib/calendar-dates";

vi.mock("@/app/actions/visits", () => ({
  saveVisit: vi.fn(async () => null),
  updateVisit: vi.fn(async () => null),
}));

import { isEmptyNoteValues, VisitForm, type VisitNote } from "./visit-form";

const appointmentId = "55555555-5555-4555-8555-555555555555";
const DAY = "2026-06-08";
const appointmentEnd = parseBelgradeLocal(`${DAY}T10:30`);

const formSource = readFileSync(path.join(process.cwd(), "app/danas/visit-form.tsx"), "utf8");

const savedNote: VisitNote = {
  procedureDescription: "Vađenje",
  recommendations: "Hladan oblog",
  treatmentPlan: "Kontrola",
  internalNotes: "Beleška",
};

function renderNote(visit: VisitNote | null, now: Date, role: "owner" | "dentist" = "owner"): string {
  return renderToStaticMarkup(
    <VisitForm
      role={role}
      now={now}
      visit={visit}
      appointment={{
        id: appointmentId,
        status: "completed",
        endsAt: appointmentEnd.toISOString(),
      }}
    />,
  );
}

describe("visit form", () => {
  it("keeps every field optional and does not warn until an empty save on 2026-06-08", () => {
    const html = renderNote(null, appointmentEnd, "dentist");
    const names = ["opis", "preporuke", "plan", "beleske"];
    let cursor = -1;

    expect(DAY).toBe("2026-06-08");
    expect(html).not.toContain("Termin završen bez zapisa");
    expect(html).toContain("Opis zahvata");
    expect(html).toContain("Preporuke");
    expect(html).toContain("Plan daljeg lečenja");
    expect(html).toContain("Interne beleške");
    for (const name of names) {
      const index = html.indexOf(`name="${name}"`);
      expect(index).toBeGreaterThan(cursor);
      cursor = index;
    }
    expect(html).not.toContain("required");
    expect(formSource.toLowerCase()).not.toContain("supabase");
    expect(formSource).toContain("ActionResult");
    expect(formSource).toContain("isVisitLocked(");
    expect(formSource).toContain("confirmEmpty");
    expect(formSource).toContain("Termin završen bez zapisa");
    expect(formSource).toContain("Potvrdi");
    expect(formSource).toContain("Otkaži");
    expect(formSource).toContain("isEmptyNote");
    expect(formSource).toContain("embedded");
    expect(formSource).toContain("completeOnSave");
    expect(formSource).toContain("onSaved");
    expect(formSource).not.toContain("#");
  });

  it("opens the form for a scheduled appointment when completeOnSave is set", () => {
    const html = renderToStaticMarkup(
      <VisitForm
        role="dentist"
        now={appointmentEnd}
        visit={null}
        completeOnSave
        appointment={{
          id: appointmentId,
          status: "scheduled",
          endsAt: appointmentEnd.toISOString(),
        }}
      />,
    );
    expect(html).toContain("<form");
    expect(html).toContain("Sačuvaj");
    expect(html).not.toContain("Termin završen bez zapisa");
  });

  it("treats blank visit fields as an empty note", () => {
    expect(
      isEmptyNoteValues({
        opis: "  ",
        preporuke: "",
        plan: "\n",
        beleske: "",
      }),
    ).toBe(true);
    expect(
      isEmptyNoteValues({
        opis: "Vađenje",
        preporuke: "",
        plan: "",
        beleske: "",
      }),
    ).toBe(false);
  });

  it("opens the edit for the owner before the deadline on 2026-06-08", () => {
    const html = renderNote(savedNote, appointmentEnd);

    expect(html).toContain("<form");
    expect(html).toContain('name="opis"');
    expect(html).toContain("Vađenje");
    expect(html).toContain("Sačuvaj");
    expect(html).not.toContain("Zapis je zaključan.");
    expect(html).not.toContain("Termin završen bez zapisa");
  });

  it("does not open the edit for the owner after the deadline on 2026-06-08", () => {
    const html = renderNote(null, new Date(appointmentEnd.getTime() + 24 * 60 * 60 * 1000));

    expect(html).not.toContain("<form");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain('name="opis"');
    expect(html).not.toContain('name="preporuke"');
    expect(html).not.toContain('name="plan"');
    expect(html).not.toContain('name="beleske"');
    expect(html).not.toContain("Sačuvaj");
    expect(html).toContain("Zapis je zaključan.");
    expect(html).toContain("Termin završen bez zapisa");
  });
});
