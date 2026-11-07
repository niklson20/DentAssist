import { describe, expect, it } from "vitest";

import {
  buildBookingCalendarWeeks,
  buildBookingDayRange,
  formatBookingCalendarDayLabel,
  formatBookingDayLabel,
  formatBookingMonthLabel,
} from "./booking-days";

describe("buildBookingDayRange", () => {
  it("includes today and every day up to the horizon", () => {
    expect(buildBookingDayRange("2026-03-01", 2)).toEqual([
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
    ]);
  });

  it("returns only today when the horizon is zero", () => {
    expect(buildBookingDayRange("2026-03-01", 0)).toEqual(["2026-03-01"]);
  });
});

describe("formatBookingDayLabel", () => {
  it('labels today as "Danas"', () => {
    expect(formatBookingDayLabel("2026-03-01", "2026-03-01")).toBe("Danas");
  });

  it("formats other days in Serbian", () => {
    expect(formatBookingDayLabel("2026-03-02", "2026-03-01")).toMatch(/2/);
  });
});

describe("booking calendar", () => {
  it("builds Monday-first rows for the selected month", () => {
    const weeks = buildBookingCalendarWeeks("2026-11-15");

    expect(weeks).toHaveLength(6);
    expect(weeks[0]).toEqual([
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
    ]);
    expect(weeks.at(-1)?.at(-1)).toBe("2026-12-06");
  });

  it("uses five rows when the month fits", () => {
    expect(buildBookingCalendarWeeks("2026-02-01")).toHaveLength(5);
  });

  it("formats the month and accessible day labels in Serbian", () => {
    expect(formatBookingMonthLabel("2026-11-01")).toMatch(/novembar.*2026/i);
    expect(formatBookingCalendarDayLabel("2026-11-08")).toMatch(/nedelja.*8.*novembar.*2026/i);
  });
});
