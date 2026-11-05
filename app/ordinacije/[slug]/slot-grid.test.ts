import { describe, expect, it } from "vitest";

import { buildSlotHourGrid, slotCellKey } from "./slot-grid";

function columnLabels(grid: ReturnType<typeof buildSlotHourGrid>, hour: number): string[] {
  const minutes = grid.minutesByHour.get(hour) ?? [];
  return minutes.map((minute) => grid.cells.get(slotCellKey(hour, minute))?.label ?? "");
}

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
    expect(grid.rowCount).toBe(4);
    expect(columnLabels(grid, 9)).toEqual(["09:00", "09:15", "09:30", "09:45"]);
    expect(columnLabels(grid, 10)).toEqual(["10:00", "10:15"]);
    expect(grid.cells.get(slotCellKey(9, 0))?.label).toBe("09:00");
    expect(grid.cells.get(slotCellKey(9, 15))?.label).toBe("09:15");
    expect(grid.cells.get(slotCellKey(10, 0))?.label).toBe("10:00");
    expect(grid.cells.get(slotCellKey(9, 30))?.label).toBe("09:30");
  });

  it("keeps a missing quarter-hour empty in that hour column", () => {
    const grid = buildSlotHourGrid(["2026-11-05T08:00:00.000Z", "2026-11-05T09:00:00.000Z", "2026-11-05T09:15:00.000Z"]);

    expect(grid.hours).toEqual([9, 10]);
    expect(grid.rowCount).toBe(2);
    expect(columnLabels(grid, 9)).toEqual(["09:00"]);
    expect(columnLabels(grid, 10)).toEqual(["10:00", "10:15"]);
    expect(grid.cells.has(slotCellKey(9, 15))).toBe(false);
    expect(grid.cells.get(slotCellKey(10, 15))?.label).toBe("10:15");
  });

  it("starts each hour column at its first free minute so 15:15 is not below 16:00", () => {
    const grid = buildSlotHourGrid([
      "2026-11-05T14:15:00.000Z",
      "2026-11-05T14:30:00.000Z",
      "2026-11-05T14:45:00.000Z",
      "2026-11-05T15:00:00.000Z",
      "2026-11-05T15:15:00.000Z",
      "2026-11-05T15:30:00.000Z",
    ]);

    expect(grid.hours).toEqual([15, 16]);
    expect(grid.rowCount).toBe(3);
    expect(columnLabels(grid, 15)).toEqual(["15:15", "15:30", "15:45"]);
    expect(columnLabels(grid, 16)).toEqual(["16:00", "16:15", "16:30"]);
  });
});
