import { describe, expect, it } from "vitest";

import { buildBookingDayRange, formatBookingDayLabel } from "./booking-days";

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
