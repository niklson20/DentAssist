import { describe, expect, it } from "vitest";

import { buildSlotHourGrid, slotCellKey } from "./slot-grid";

describe("buildSlotHourGrid", () => {
  it("puts each start under its hour so 09:00 is not beside 10:00", () => {
    const grid = buildSlotHourGrid([
      "2026-11-05T08:00:00.000Z",
      "2026-11-05T08:15:00.000Z",
      "2026-11-05T08:30:00.000Z",
      "2026-11-05T08:45:00.000Z",
      "2026-11-05T09:00:00.000Z",
      "2026-11-05T09:15:00.000Z",
    ]);

    expect(grid.hours).toEqual([9, 10]);
    expect(grid.minutes).toEqual([0, 15, 30, 45]);
    expect(grid.cells.get(slotCellKey(9, 0))?.label).toBe("09:00");
    expect(grid.cells.get(slotCellKey(9, 15))?.label).toBe("09:15");
    expect(grid.cells.get(slotCellKey(10, 0))?.label).toBe("10:00");
    expect(grid.cells.get(slotCellKey(9, 30))?.label).toBe("09:30");
  });

  it("keeps a missing quarter-hour empty in that hour column", () => {
    const grid = buildSlotHourGrid(["2026-11-05T08:00:00.000Z", "2026-11-05T09:00:00.000Z", "2026-11-05T09:15:00.000Z"]);

    expect(grid.hours).toEqual([9, 10]);
    expect(grid.minutes).toEqual([0, 15]);
    expect(grid.cells.has(slotCellKey(9, 15))).toBe(false);
    expect(grid.cells.get(slotCellKey(10, 15))?.label).toBe("10:15");
  });
});
