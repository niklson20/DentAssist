import { describe, expect, it } from "vitest";

import { defaultDaySchedule, workingHoursSaveSchema } from "./schema";

const memberId = "22222222-2222-4222-8222-222222222222";

function openWeek() {
  return [1, 2, 3, 4, 5, 6, 7].map((isoDow) => {
    const weekday = isoDow <= 5;
    return {
      isoDow,
      isClosed: !weekday,
      opensAt: weekday ? "09:00" : "",
      closesAt: weekday ? "17:00" : "",
      breakStartsAt: weekday ? "12:00" : "",
      breakEndsAt: weekday ? "12:30" : "",
    };
  });
}

describe("workingHoursSaveSchema", () => {
  it("accepts a full week with a lunch break", () => {
    const result = workingHoursSaveSchema.safeParse({
      memberId,
      days: openWeek(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects an end before the start", () => {
    const days = openWeek();
    days[0] = { ...days[0], closesAt: "08:00" };
    const result = workingHoursSaveSchema.safeParse({ memberId, days });
    expect(result.success).toBe(false);
  });

  it("rejects a break outside working hours", () => {
    const days = openWeek();
    days[0] = { ...days[0], breakStartsAt: "18:00", breakEndsAt: "18:30" };
    const result = workingHoursSaveSchema.safeParse({ memberId, days });
    expect(result.success).toBe(false);
  });
});

describe("defaultDaySchedule", () => {
  it("opens weekdays and closes weekends by default", () => {
    expect(defaultDaySchedule(1).isClosed).toBe(false);
    expect(defaultDaySchedule(6).isClosed).toBe(true);
  });
});
