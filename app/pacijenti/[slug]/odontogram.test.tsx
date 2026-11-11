import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TOOTH_STATUSES, TOOTH_SURFACES, toothStatusLabels, toothSurfaceLabels } from "@/lib/labels";

vi.mock("@phosphor-icons/react", () => ({
  TrashSimple: () => <span data-icon="trash" />,
}));

vi.mock("@/app/actions/teeth", () => ({
  saveToothStatus: vi.fn(),
  saveToothSurfaces: vi.fn(),
  undoToothChange: vi.fn(),
}));

import {
  Odontogram,
  applyStatusChange,
  createToothChart,
  nextSelectedTooth,
  removeChange,
  toggleSurface,
  type ToothChart,
} from "./odontogram";

const actor = "Dr Ana Anić";
const componentSource = readFileSync(
  path.join(process.cwd(), "app/pacijenti/[slug]/odontogram.tsx"),
  "utf8",
);
const pageSource = readFileSync(path.join(process.cwd(), "app/pacijenti/[slug]/page.tsx"), "utf8");
const cssSource = readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

describe("odontogram", () => {
  it("clears the editor when the same tooth is chosen again", () => {
    expect(nextSelectedTooth(null, "45")).toBe("45");
    expect(nextSelectedTooth("45", "45")).toBeNull();
    expect(nextSelectedTooth("45", "46")).toBe("46");
    expect(componentSource).toContain("nextSelectedTooth");
    expect(componentSource).toContain('document.addEventListener("pointerdown"');
    expect(componentSource).toContain(".odontogram__editor");
    expect(componentSource).toContain(".odontogram__tooth");
  });

  it("shows surfaces for caries, none for a crown, and the old and new status under the map", () => {
    let chart = createToothChart();
    chart = applyStatusChange(chart, {
      tooth: "11",
      status: "caries",
      actor,
      at: "2026-10-24T08:00:00.000Z",
    });
    chart = toggleSurface(chart, "11", "mesial");
    chart = toggleSurface(chart, "11", "occlusal");
    expect(chart.teeth["11"].surfaces).toEqual(["occlusal", "mesial"]);

    const cariesHtml = renderToStaticMarkup(
      <Odontogram actor={actor} chart={chart} selectedTooth="11" />,
    );
    expect(cariesHtml.match(/data-surface="/g)).toHaveLength(TOOTH_SURFACES.length);
    for (const surface of TOOTH_SURFACES) {
      expect(cariesHtml).toContain(`data-surface="${surface}"`);
    }
    expect(cariesHtml).toContain(toothSurfaceLabels.occlusal);
    expect(cariesHtml).toMatch(
      /data-surface="mesial"[^>]*data-area="screen-right"|data-area="screen-right"[^>]*data-surface="mesial"/,
    );
    expect(cariesHtml.indexOf("odontogram__arches")).toBeLessThan(cariesHtml.indexOf("odontogram__log"));

    chart = applyStatusChange(chart, {
      tooth: "11",
      status: "crown",
      actor,
      at: "2026-10-24T08:05:00.000Z",
    });
    expect(chart.teeth["11"].status).toBe("crown");
    expect(chart.teeth["11"].surfaces).toEqual([]);
    expect(chart.changes[0]).toMatchObject({ from: "caries", to: "crown", actor, tooth: "11" });

    const crowned = applyStatusChange(createToothChart(), {
      tooth: "16",
      status: "crown",
      actor,
      at: "2026-10-24T08:00:00.000Z",
    });
    expect(toggleSurface(crowned, "16", "distal")).toBe(crowned);

    const crownHtml = renderToStaticMarkup(
      <Odontogram actor={actor} chart={chart} selectedTooth="11" />,
    );
    expect(crownHtml).not.toContain("data-surface");
    expect(crownHtml).not.toContain("odontogram__surfaces");
    expect(crownHtml).not.toContain(toothSurfaceLabels.occlusal);
    const log = crownHtml.slice(crownHtml.indexOf("odontogram__log"));
    expect(crownHtml.indexOf("odontogram__arches")).toBeLessThan(crownHtml.indexOf("odontogram__log"));
    expect(log).toContain('data-previous-status="caries"');
    expect(log).toContain('data-next-status="crown"');
    expect(log.indexOf('data-previous-status="caries"')).toBeLessThan(log.indexOf('data-next-status="crown"'));
    expect(log).toContain(toothStatusLabels.caries);
    expect(log).toContain(toothStatusLabels.crown);
    expect(log).toContain(actor);
    expect(log).toContain("2026-10-24T08:05:00.000Z");
    expect(log).toContain('aria-label="Obriši izmenu zuba 11"');
    expect(log).toContain("odontogram__change-delete");

    const base = createToothChart();
    const leftover: ToothChart = {
      teeth: {
        ...base.teeth,
        "11": { status: "crown", surfaces: ["occlusal"] },
      },
      changes: [
        {
          at: "2026-10-24T08:05:00.000Z",
          actor,
          tooth: "11",
          from: "caries",
          to: "crown",
        },
      ],
    };
    const leftoverHtml = renderToStaticMarkup(
      <Odontogram actor={actor} chart={leftover} selectedTooth="11" />,
    );
    expect(leftoverHtml).not.toContain("data-surface");

    const filling = applyStatusChange(createToothChart(), {
      tooth: "21",
      status: "filling",
      actor,
      at: "2026-10-24T08:10:00.000Z",
    });
    const fillingHtml = renderToStaticMarkup(
      <Odontogram actor={actor} chart={filling} selectedTooth="21" />,
    );
    expect(fillingHtml.match(/data-surface="/g)).toHaveLength(TOOTH_SURFACES.length);
    expect(fillingHtml).toMatch(
      /data-surface="mesial"[^>]*data-area="screen-left"|data-area="screen-left"[^>]*data-surface="mesial"/,
    );
  });

  it("removes a history row and restores the tooth when the newest change is deleted", () => {
    let chart = createToothChart();
    chart = applyStatusChange(chart, {
      tooth: "45",
      status: "fracture",
      actor,
      at: "2026-11-10T22:10:00.000Z",
    });
    chart = applyStatusChange(chart, {
      tooth: "45",
      status: "root_canal",
      actor,
      at: "2026-11-10T22:11:00.000Z",
    });
    chart = applyStatusChange(chart, {
      tooth: "45",
      status: "fracture",
      actor,
      at: "2026-11-10T22:12:00.000Z",
    });
    chart = applyStatusChange(chart, {
      tooth: "11",
      status: "crown",
      actor,
      at: "2026-11-10T22:13:00.000Z",
    });

    expect(chart.teeth["45"].status).toBe("fracture");
    expect(chart.changes).toHaveLength(4);

    chart = removeChange(chart, 0);
    expect(chart.teeth["11"].status).toBe("healthy");
    expect(chart.teeth["45"].status).toBe("fracture");
    expect(chart.changes).toHaveLength(3);
    expect(chart.changes.map((change) => change.tooth)).toEqual(["45", "45", "45"]);

    chart = removeChange(chart, 2);
    expect(chart.teeth["45"].status).toBe("fracture");
    expect(chart.changes).toHaveLength(2);
    expect(chart.changes.map((change) => `${change.from}->${change.to}`)).toEqual([
      "root_canal->fracture",
      "fracture->root_canal",
    ]);

    chart = removeChange(chart, 0);
    expect(chart.teeth["45"].status).toBe("root_canal");
    expect(chart.changes).toEqual([
      {
        at: "2026-11-10T22:11:00.000Z",
        actor,
        tooth: "45",
        from: "fracture",
        to: "root_canal",
      },
    ]);
  });

  it("lays out both FDI arches with the patient right on the left, and keeps reception off the map", () => {
    const html = renderToStaticMarkup(<Odontogram actor="Stomatolog" />);
    expect(html.match(/data-tooth="/g)).toHaveLength(52);
    expect(html).not.toContain("data-surface");

    const order = ["18", "11", "21", "28", "55", "51", "61", "65", "85", "81", "71", "75", "48", "41", "31", "38"];
    let previous = -1;
    for (const tooth of order) {
      const index = html.indexOf(`data-tooth="${tooth}"`);
      expect(index).toBeGreaterThan(previous);
      previous = index;
    }

    const upper = html.slice(
      html.indexOf('data-arch="permanent-upper"'),
      html.indexOf('data-arch="primary-upper"'),
    );
    expect(upper.indexOf('data-side="patient-right"')).toBeLessThan(upper.indexOf("odontogram__midline"));
    expect(upper.indexOf("odontogram__midline")).toBeLessThan(upper.indexOf('data-side="patient-left"'));
    expect(upper.indexOf('data-tooth="11"')).toBeLessThan(upper.indexOf("odontogram__midline"));
    expect(upper.indexOf("odontogram__midline")).toBeLessThan(upper.indexOf('data-tooth="21"'));

    expect(componentSource.toLowerCase()).not.toContain("supabase");
    expect(componentSource).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(pageSource.toLowerCase()).not.toContain("supabase");
    expect(pageSource.match(/<Odontogram/g)).toHaveLength(1);
    expect(pageSource).toContain('panelId="chart-panel-zubi"');
    expect(pageSource).toContain("actor={actor}");
    expect(pageSource).toContain("loadCurrentMemberActor");
    expect(pageSource).toContain("patientId={chart.patientId}");
    expect(pageSource).toContain("chart={chart.toothChart}");
    expect(pageSource.indexOf("{clinical && chart.toothChart ? (")).toBeLessThan(
      pageSource.indexOf("<Odontogram"),
    );

    const blockStart = cssSource.indexOf("/* odontogram */");
    expect(blockStart).toBeGreaterThanOrEqual(0);
    const block = cssSource.slice(blockStart);
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(block).toContain(".odontogram__change-delete");
    for (const status of TOOTH_STATUSES) {
      expect(block).toContain(`[data-status="${status}"]`);
    }
    for (const token of [
      "--card",
      "--muted",
      "--muted-foreground",
      "--destructive",
      "--primary",
      "--border",
      "--background",
      "--chart-1",
      "--chart-5",
    ]) {
      expect(block).toContain(`var(${token})`);
    }
  });
});
