import { describe, expect, it } from "vitest";

import { getClinicHoursStatus } from "./clinic-hours-status";

const weekdayHours = { opensAt: "09:00:00", closesAt: "17:00:00" };
const weekendHours = { opensAt: "10:00:00", closesAt: "14:00:00" };

describe("getClinicHoursStatus", () => {
  it("uses the Belgrade weekday and local time", () => {
    expect(
      getClinicHoursStatus({
        now: new Date("2026-11-09T09:00:00.000Z"),
        weekdayHours,
        weekendHours,
        weekdayHasSchedule: true,
        weekendHasSchedule: true,
      }),
    ).toBe("open");
  });

  it("uses weekend hours on Saturday", () => {
    expect(
      getClinicHoursStatus({
        now: new Date("2026-11-07T10:00:00.000Z"),
        weekdayHours,
        weekendHours,
        weekdayHasSchedule: true,
        weekendHasSchedule: true,
      }),
    ).toBe("open");
  });

  it("considers the closing time closed", () => {
    expect(
      getClinicHoursStatus({
        now: new Date("2026-11-09T16:00:00.000Z"),
        weekdayHours,
        weekendHours,
        weekdayHasSchedule: true,
        weekendHasSchedule: true,
      }),
    ).toBe("closed");
  });

  it("distinguishes a known closure from missing hours", () => {
    expect(
      getClinicHoursStatus({
        now: new Date("2026-11-07T10:00:00.000Z"),
        weekdayHours,
        weekendHours: null,
        weekdayHasSchedule: true,
        weekendHasSchedule: true,
      }),
    ).toBe("closed");

    expect(
      getClinicHoursStatus({
        now: new Date("2026-11-07T10:00:00.000Z"),
        weekdayHours,
        weekendHours: null,
        weekdayHasSchedule: true,
        weekendHasSchedule: false,
      }),
    ).toBe("unknown");
  });

  it("supports hours that pass midnight", () => {
    expect(
      getClinicHoursStatus({
        now: new Date("2026-11-09T23:30:00.000Z"),
        weekdayHours: { opensAt: "00:00:00", closesAt: "02:00:00" },
        weekendHours,
        weekdayHasSchedule: true,
        weekendHasSchedule: true,
      }),
    ).toBe("open");
  });
});
