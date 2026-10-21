import { describe, expect, it } from "vitest";
import { bookingDeadline, type WeeklyHours } from "@/lib/booking-deadline";
import { localTimeOnDate } from "@/lib/calendar-dates";

function week(closedDays: readonly number[] = []): WeeklyHours[] {
  return [1, 2, 3, 4, 5, 6, 7].map((isoDow) => {
    const isClosed = closedDays.includes(isoDow);
    return {
      isoDow: isoDow as WeeklyHours["isoDow"],
      isClosed,
      opensAt: isClosed ? null : "09:00",
      closesAt: isClosed ? null : "17:00",
    };
  });
}

describe("bookingDeadline", () => {
  const startsFarAway = new Date("2026-07-01T08:00:00.000Z");

  it("adds 24 elapsed hours when every day is open", () => {
    expect(
      bookingDeadline({
        createdAt: new Date("2026-06-01T08:00:00.000Z"),
        startsAt: startsFarAway,
        workingHours: week(),
        blockedPeriods: [],
      }).toISOString(),
    ).toBe("2026-06-02T08:00:00.000Z");
  });

  it("skips a closed day instead of spending the deadline on it", () => {
    expect(
      bookingDeadline({
        createdAt: new Date("2026-06-01T08:00:00.000Z"),
        startsAt: startsFarAway,
        workingHours: week([2]),
        blockedPeriods: [],
      }).toISOString(),
    ).toBe("2026-06-03T08:00:00.000Z");
  });

  it("skips a weekend and keeps counting on the next open day", () => {
    expect(
      bookingDeadline({
        createdAt: new Date("2026-06-05T16:00:00.000Z"),
        startsAt: startsFarAway,
        workingHours: week([6, 7]),
        blockedPeriods: [],
      }).toISOString(),
    ).toBe("2026-06-08T16:00:00.000Z");
  });

  it("stops at the appointment start when that comes first", () => {
    expect(
      bookingDeadline({
        createdAt: new Date("2026-06-01T08:00:00.000Z"),
        startsAt: new Date("2026-06-02T07:00:00.000Z"),
        workingHours: week(),
        blockedPeriods: [],
      }).toISOString(),
    ).toBe("2026-06-02T07:00:00.000Z");
  });

  it("treats one block from open to close as a closed day", () => {
    expect(
      bookingDeadline({
        createdAt: new Date("2026-06-01T08:00:00.000Z"),
        startsAt: startsFarAway,
        workingHours: week(),
        blockedPeriods: [
          {
            startsAt: localTimeOnDate("2026-06-02", "09:00"),
            endsAt: localTimeOnDate("2026-06-02", "17:00"),
          },
        ],
      }).toISOString(),
    ).toBe("2026-06-03T08:00:00.000Z");
  });

  it("does not skip a day for a partial block", () => {
    expect(
      bookingDeadline({
        createdAt: new Date("2026-06-01T08:00:00.000Z"),
        startsAt: startsFarAway,
        workingHours: week(),
        blockedPeriods: [
          {
            startsAt: localTimeOnDate("2026-06-02", "09:00"),
            endsAt: localTimeOnDate("2026-06-02", "12:00"),
          },
        ],
      }).toISOString(),
    ).toBe("2026-06-02T08:00:00.000Z");
  });

  it("counts elapsed time across the spring-forward day", () => {
    expect(
      bookingDeadline({
        createdAt: new Date("2026-03-28T19:00:00.000Z"),
        startsAt: new Date("2026-04-15T08:00:00.000Z"),
        workingHours: week(),
        blockedPeriods: [],
      }).toISOString(),
    ).toBe("2026-03-29T19:00:00.000Z");
  });

  it("counts elapsed time across the fall-back day", () => {
    expect(
      bookingDeadline({
        createdAt: new Date("2026-10-24T18:00:00.000Z"),
        startsAt: new Date("2026-11-15T08:00:00.000Z"),
        workingHours: week(),
        blockedPeriods: [],
      }).toISOString(),
    ).toBe("2026-10-25T18:00:00.000Z");
  });

  it("does not move past a start that is already due", () => {
    const startsAt = new Date("2026-06-01T07:00:00.000Z");
    expect(
      bookingDeadline({
        createdAt: startsAt,
        startsAt,
        workingHours: week(),
        blockedPeriods: [],
      }).toISOString(),
    ).toBe(startsAt.toISOString());
  });
});
