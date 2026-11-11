import { describe, expect, it } from "vitest";

import {
  actorLabelForMember,
  createToothChart,
  surfacesForDb,
  toothChartFromRows,
} from "./tooth-chart";

describe("toothChartFromRows", () => {
  it("fills missing teeth as healthy and maps history actors by name", () => {
    const chart = toothChartFromRows(
      [
        {
          id: "state-11",
          fdi_code: "11",
          status: "caries",
          surfaces: ["mesial", "occlusal"],
        },
        {
          id: "state-16",
          fdi_code: "16",
          status: "crown",
          surfaces: null,
        },
      ],
      [
        {
          id: "change-2",
          tooth_state_id: "state-11",
          old_status: "healthy",
          new_status: "caries",
          old_surfaces: null,
          new_surfaces: ["mesial"],
          changed_by: "member-1",
          changed_at: "2026-11-11T10:00:00.000Z",
        },
        {
          id: "change-1",
          tooth_state_id: "state-16",
          old_status: null,
          new_status: "crown",
          old_surfaces: null,
          new_surfaces: null,
          changed_by: "member-2",
          changed_at: "2026-11-11T09:00:00.000Z",
        },
      ],
      [
        {
          id: "member-1",
          role: "dentist",
          first_name: "Ana",
          last_name: "Anić",
        },
        {
          id: "member-2",
          role: "owner",
          first_name: "Marko",
          last_name: "Marković",
        },
      ],
    );

    expect(chart.teeth["11"]).toEqual({ status: "caries", surfaces: ["occlusal", "mesial"] });
    expect(chart.teeth["16"]).toEqual({ status: "crown", surfaces: [] });
    expect(chart.teeth["21"]).toEqual({ status: "healthy", surfaces: [] });
    expect(chart.changes).toEqual([
      {
        id: "change-2",
        at: "2026-11-11T10:00:00.000Z",
        actor: "Ana Anić",
        tooth: "11",
        from: "healthy",
        to: "caries",
      },
      {
        id: "change-1",
        at: "2026-11-11T09:00:00.000Z",
        actor: "Marko Marković",
        tooth: "16",
        from: "healthy",
        to: "crown",
      },
    ]);
    expect(actorLabelForMember({ id: "member-2", role: "owner", first_name: "Marko", last_name: "Marković" })).toBe(
      "Marko Marković",
    );
  });

  it("treats null changed_by as a dash and ignores unknown fdi codes", () => {
    const empty = createToothChart();
    const chart = toothChartFromRows(
      [{ id: "bad", fdi_code: "99", status: "caries", surfaces: null }],
      [
        {
          id: "change-x",
          tooth_state_id: "missing",
          old_status: "healthy",
          new_status: "filling",
          old_surfaces: null,
          new_surfaces: null,
          changed_by: null,
          changed_at: "2026-11-11T12:00:00.000Z",
        },
      ],
      [],
    );
    expect(chart.teeth).toEqual(empty.teeth);
    expect(chart.changes).toEqual([]);
    expect(actorLabelForMember(undefined)).toBe("—");
  });
});

describe("surfacesForDb", () => {
  it("stores null for empty or non-surface statuses", () => {
    expect(surfacesForDb("crown", [])).toBeNull();
    expect(surfacesForDb("caries", [])).toBeNull();
    expect(surfacesForDb("filling", ["distal", "mesial"])).toEqual(["mesial", "distal"]);
  });
});
