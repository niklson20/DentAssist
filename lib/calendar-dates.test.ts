import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  addCalendarMonths,
  belgradeLocalToISO,
  fifteenthBirthday,
  formatBelgrade,
  formatBelgradeDate,
  hasTurned15,
  isDocumentLocked,
  isVisitLocked,
  isoDayOfWeek,
  needsPatientEmailTask,
  parseBelgradeLocal,
  parseCalendarState,
  startOfBelgradeWeek,
} from "@/lib/calendar-dates";

describe("belgradeLocalToISO", () => {
  it("converts winter time as CET", () => {
    expect(belgradeLocalToISO({ year: 2026, month: 1, day: 15, hour: 9, minute: 0 })).toBe(
      "2026-01-15T08:00:00.000Z",
    );
  });

  it("converts summer time as CEST", () => {
    expect(belgradeLocalToISO({ year: 2026, month: 7, day: 15, hour: 9, minute: 0 })).toBe(
      "2026-07-15T07:00:00.000Z",
    );
  });

  it("keeps the hour before the spring-forward gap", () => {
    expect(belgradeLocalToISO({ year: 2026, month: 3, day: 29, hour: 1, minute: 30 })).toBe(
      "2026-03-29T00:30:00.000Z",
    );
  });

  it("moves a missing spring-forward time one hour later", () => {
    expect(belgradeLocalToISO({ year: 2026, month: 3, day: 29, hour: 2, minute: 30 })).toBe(
      "2026-03-29T01:30:00.000Z",
    );
  });

  it("uses the later occurrence of the repeated fall-back hour", () => {
    expect(belgradeLocalToISO({ year: 2026, month: 10, day: 25, hour: 2, minute: 30 })).toBe(
      "2026-10-25T01:30:00.000Z",
    );
  });

  it("reads the Belgrade calendar date, not the UTC date", () => {
    expect(formatBelgradeDate(new Date("2026-01-04T23:30:00.000Z"))).toBe("2026-01-05");
  });
});

describe("formatBelgrade", () => {
  it("uses the Latin Serbian locale", () => {
    const formatted = formatBelgrade(new Date("2026-10-21T07:00:00.000Z"), {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    expect(formatted).toBe("sreda, 21. oktobar 2026.");
  });
});

describe("weeks", () => {
  it("starts a week on Monday", () => {
    expect(isoDayOfWeek("2026-10-19")).toBe(1);
    expect(isoDayOfWeek("2026-10-25")).toBe(7);
    expect(startOfBelgradeWeek("2026-10-21")).toBe("2026-10-19");
    expect(startOfBelgradeWeek("2026-10-19")).toBe("2026-10-19");
    expect(startOfBelgradeWeek("2026-10-25")).toBe("2026-10-19");
  });

  it("adds calendar days across month ends", () => {
    expect(addCalendarDays("2026-06-01", 30)).toBe("2026-07-01");
  });

  it("moves a month and keeps the day when that month has it", () => {
    expect(addCalendarMonths("2026-10-24", 1)).toBe("2026-11-24");
    expect(addCalendarMonths("2026-10-24", -1)).toBe("2026-09-24");
    expect(addCalendarMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addCalendarMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addCalendarMonths("2026-12-15", 1)).toBe("2027-01-15");
  });
});

describe("locks", () => {
  const endsAt = new Date("2026-06-01T10:00:00.000Z");

  it("locks a visit 24 hours after it ends", () => {
    expect(isVisitLocked(endsAt, new Date("2026-06-02T09:59:59.999Z"))).toBe(false);
    expect(isVisitLocked(endsAt, new Date("2026-06-02T10:00:00.000Z"))).toBe(true);
  });

  it("locks a document 24 hours after it is created", () => {
    expect(isDocumentLocked(endsAt, new Date("2026-06-02T09:59:59.999Z"))).toBe(false);
    expect(isDocumentLocked(endsAt, new Date("2026-06-02T10:00:00.000Z"))).toBe(true);
  });
});

describe("fifteenth birthday", () => {
  it("turns 15 on the anniversary", () => {
    expect(fifteenthBirthday("2011-10-21")).toBe("2026-10-21");
    expect(hasTurned15("2011-10-21", "2026-10-20")).toBe(false);
    expect(hasTurned15("2011-10-21", "2026-10-21")).toBe(true);
    expect(hasTurned15("2011-10-21", "2030-01-01")).toBe(true);
  });

  it("moves a 29 February birthday to 1 March in a non-leap year", () => {
    expect(fifteenthBirthday("2012-02-29")).toBe("2027-03-01");
    expect(hasTurned15("2012-02-29", "2027-02-28")).toBe(false);
    expect(hasTurned15("2012-02-29", "2027-03-01")).toBe(true);
  });
});

describe("needsPatientEmailTask", () => {
  const base = {
    hasContact: true,
    dateOfBirth: "2011-10-21",
    email: null,
    emailDeclined: false,
    onDate: "2026-10-21",
  };

  it("is due on the 15th birthday when a contact exists and the email is empty", () => {
    expect(needsPatientEmailTask(base)).toBe(true);
    expect(needsPatientEmailTask({ ...base, email: "   " })).toBe(true);
  });

  it("stays off before the birthday, without a contact, with an email, or when declined", () => {
    expect(needsPatientEmailTask({ ...base, onDate: "2026-10-20" })).toBe(false);
    expect(needsPatientEmailTask({ ...base, hasContact: false })).toBe(false);
    expect(needsPatientEmailTask({ ...base, email: "ana@example.com" })).toBe(false);
    expect(needsPatientEmailTask({ ...base, emailDeclined: true })).toBe(false);
    expect(needsPatientEmailTask({ ...base, dateOfBirth: null })).toBe(false);
  });
});

describe("parseCalendarState", () => {
  it("defaults to the week view on today", () => {
    expect(parseCalendarState({}, "2026-06-01")).toEqual({
      prikaz: "nedelja",
      datum: "2026-06-01",
      stomatolog: null,
    });
  });

  it("reads the view, date, and dentist from the query", () => {
    const params = new URLSearchParams("prikaz=nedelja&datum=2026-06-08&stomatolog=dent-1");
    expect(parseCalendarState(params, "2026-06-01")).toEqual({
      prikaz: "nedelja",
      datum: "2026-06-08",
      stomatolog: "dent-1",
    });
  });

  it("falls back when the view or date is not usable", () => {
    expect(parseCalendarState({ prikaz: "godina", datum: "2026-02-31" }, "2026-06-01")).toEqual({
      prikaz: "nedelja",
      datum: "2026-06-01",
      stomatolog: null,
    });
  });
});

describe("parseBelgradeLocal", () => {
  it("parses a zoned local time without using a zoneless Date string", () => {
    expect(parseBelgradeLocal("2026-01-15T09:00").toISOString()).toBe("2026-01-15T08:00:00.000Z");
  });
});
