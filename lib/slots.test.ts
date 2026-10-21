import { describe, expect, it } from "vitest";
import { localTimeOnDate } from "@/lib/calendar-dates";
import type { AppointmentStatus } from "@/lib/labels";
import { appointmentsOverlap, availableSlotStarts, type ScheduledAppointment, type WorkingInterval } from "@/lib/slots";

const OPEN_DAY: WorkingInterval = {
  isClosed: false,
  opensAt: "09:00",
  closesAt: "12:00",
  breakStartsAt: null,
  breakEndsAt: null,
};

function appointment(
  dentistId: string,
  start: string,
  end: string,
  status: AppointmentStatus,
  day = "2026-06-01",
): ScheduledAppointment {
  return {
    dentistId,
    startsAt: localTimeOnDate(day, start),
    endsAt: localTimeOnDate(day, end),
    status,
  };
}

function starts(overrides: Partial<Parameters<typeof availableSlotStarts>[0]> = {}) {
  return availableSlotStarts({
    dentistId: "dentist-1",
    now: new Date("2026-06-01T05:00:00.000Z"),
    day: "2026-06-01",
    slotMinutes: 30,
    bufferMinutes: 0,
    durationMinutes: 30,
    minNoticeMinutes: 0,
    maxAheadDays: 30,
    unavailable: false,
    workingDay: OPEN_DAY,
    blockedPeriods: [],
    occupied: [],
    ...overrides,
  }).map((start) => start.toISOString());
}

describe("availableSlotStarts", () => {
  it("places starts on the clinic step inside working hours", () => {
    expect(starts()).toEqual([
      "2026-06-01T07:00:00.000Z",
      "2026-06-01T07:30:00.000Z",
      "2026-06-01T08:00:00.000Z",
      "2026-06-01T08:30:00.000Z",
      "2026-06-01T09:00:00.000Z",
      "2026-06-01T09:30:00.000Z",
    ]);
  });

  it("uses a 15 minute step when the clinic says so", () => {
    const first = starts({
      slotMinutes: 15,
      durationMinutes: 15,
      workingDay: { ...OPEN_DAY, opensAt: "09:10", closesAt: "10:00" },
    });
    expect(first).toEqual(["2026-06-01T07:15:00.000Z", "2026-06-01T07:30:00.000Z", "2026-06-01T07:45:00.000Z"]);
  });

  it("snaps the next start to the step on or after the appointment end plus the gap", () => {
    expect(
      starts({
        slotMinutes: 15,
        bufferMinutes: 10,
        occupied: [appointment("dentist-1", "09:00", "09:30", "scheduled")],
      }),
    ).toContain("2026-06-01T07:45:00.000Z");
    expect(
      starts({
        slotMinutes: 15,
        bufferMinutes: 10,
        occupied: [appointment("dentist-1", "09:00", "09:30", "scheduled")],
      }),
    ).not.toContain("2026-06-01T07:30:00.000Z");
  });

  it("lets a start sit exactly on the end plus the gap when that is a step", () => {
    expect(
      starts({
        slotMinutes: 15,
        bufferMinutes: 15,
        occupied: [appointment("dentist-1", "09:00", "10:00", "scheduled")],
      }),
    ).toContain("2026-06-01T08:15:00.000Z");
  });

  it("ignores a cancelled appointment and another dentist", () => {
    expect(
      starts({
        occupied: [
          appointment("dentist-1", "09:00", "10:00", "cancelled"),
          appointment("dentist-2", "09:00", "12:00", "scheduled"),
        ],
      }),
    ).toContain("2026-06-01T07:00:00.000Z");
  });

  it("keeps a no-show on the grid", () => {
    expect(starts({ occupied: [appointment("dentist-1", "09:00", "09:30", "no_show")] })).not.toContain(
      "2026-06-01T07:00:00.000Z",
    );
  });

  it("skips the break and a blocked range", () => {
    expect(
      starts({
        slotMinutes: 15,
        workingDay: {
          ...OPEN_DAY,
          closesAt: "14:00",
          breakStartsAt: "12:00",
          breakEndsAt: "12:30",
        },
        blockedPeriods: [
          {
            startsAt: localTimeOnDate("2026-06-01", "13:00"),
            endsAt: localTimeOnDate("2026-06-01", "13:30"),
          },
        ],
      }),
    ).toEqual(expect.not.arrayContaining(["2026-06-01T09:45:00.000Z", "2026-06-01T11:00:00.000Z"]));
    expect(
      starts({
        slotMinutes: 15,
        workingDay: {
          ...OPEN_DAY,
          closesAt: "14:00",
          breakStartsAt: "12:00",
          breakEndsAt: "12:30",
        },
      }),
    ).toContain("2026-06-01T10:30:00.000Z");
  });

  it("hides starts inside the notice window and outside the horizon", () => {
    expect(starts({ now: new Date("2026-06-01T07:00:00.000Z"), minNoticeMinutes: 120 })[0]).toBe(
      "2026-06-01T09:00:00.000Z",
    );
    expect(starts({ day: "2026-07-02", maxAheadDays: 30 })).toEqual([]);
    expect(starts({ day: "2026-07-01", maxAheadDays: 30 })).toContain("2026-07-01T07:00:00.000Z");
    expect(starts({ day: "2026-05-31" })).toEqual([]);
  });

  it("returns nothing when the dentist is closed, unavailable, or the duration is off the step", () => {
    expect(starts({ unavailable: true })).toEqual([]);
    expect(starts({ workingDay: { ...OPEN_DAY, isClosed: true, opensAt: null, closesAt: null } })).toEqual([]);
    expect(starts({ workingDay: null })).toEqual([]);
    expect(starts({ durationMinutes: 20 })).toEqual([]);
    expect(starts({ durationMinutes: 150 })).toEqual([]);
  });

  it("converts a winter start with the CET offset", () => {
    expect(
      starts({
        now: new Date("2026-01-15T06:00:00.000Z"),
        day: "2026-01-15",
      })[0],
    ).toBe("2026-01-15T08:00:00.000Z");
  });
});

describe("appointmentsOverlap", () => {
  it("overlaps only the same dentist and only a status that holds the slot", () => {
    const scheduled = appointment("dentist-1", "09:00", "09:30", "scheduled");
    const touching = appointment("dentist-1", "09:30", "10:00", "scheduled");
    const overlapping = appointment("dentist-1", "09:15", "09:45", "pending_confirmation");
    expect(appointmentsOverlap(scheduled, touching)).toBe(false);
    expect(appointmentsOverlap(scheduled, overlapping)).toBe(true);
    expect(appointmentsOverlap(scheduled, appointment("dentist-2", "09:00", "09:30", "scheduled"))).toBe(false);
    expect(appointmentsOverlap(scheduled, appointment("dentist-1", "09:00", "09:30", "cancelled"))).toBe(false);
    expect(appointmentsOverlap(scheduled, appointment("dentist-1", "09:00", "09:30", "offered"))).toBe(true);
    expect(appointmentsOverlap(scheduled, appointment("dentist-1", "09:00", "09:30", "completed"))).toBe(true);
  });
});
