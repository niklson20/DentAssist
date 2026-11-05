import { describe, expect, it } from "vitest";

import { belgradeMinutes, nextMinuteDelay, nowLineFraction } from "./now-line";

describe("now line", () => {
  it("places the line on the exact minute inside the visible hours", () => {
    expect(nowLineFraction(8, 9, 8 * 60)).toBe(0);
    expect(nowLineFraction(8, 9, 8 * 60 + 30)).toBe(30 / 540);
    expect(nowLineFraction(8, 9, 12 * 60 + 17)).toBe((4 * 60 + 17) / (9 * 60));
    expect(nowLineFraction(8, 9, 17 * 60)).toBe(1);
    expect(nowLineFraction(8, 9, 7 * 60 + 59)).toBeNull();
    expect(nowLineFraction(8, 9, 17 * 60 + 1)).toBeNull();
    expect(nowLineFraction(8, 0, 10 * 60)).toBeNull();
  });

  it("reads Belgrade hours and minutes", () => {
    expect(belgradeMinutes(new Date("2026-11-05T11:17:00.000Z"))).toBe(12 * 60 + 17);
  });

  it("wakes on the next minute", () => {
    expect(nextMinuteDelay(60_000)).toBe(60_000);
    expect(nextMinuteDelay(60_001)).toBe(59_999);
    expect(nextMinuteDelay(90_000)).toBe(30_000);
  });
});
