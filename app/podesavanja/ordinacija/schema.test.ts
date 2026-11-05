import { describe, expect, it } from "vitest";

import { clinicProfileSchema, DESCRIPTION_MAX_LENGTH, durationOptionsForSlot } from "./schema";

describe("clinicProfileSchema", () => {
  const base = {
    name: "Ordinacija",
    city: "Beograd",
    address: "Knez Mihailova 1",
    phone: "+381112345678",
    description: "",
    onlineBookingEnabled: true,
    slotMinutes: 30,
    bufferMinutes: 0,
    defaultDurationMin: 30,
    minNoticeMinutes: 120,
    maxAheadDays: 30,
  };

  it("accepts slot step and horizon together", () => {
    const parsed = clinicProfileSchema.safeParse(base);
    expect(parsed.success).toBe(true);
  });

  it("rejects duration that is not a multiple of the slot step", () => {
    const parsed = clinicProfileSchema.safeParse({ ...base, defaultDurationMin: 45, slotMinutes: 30 });
    expect(parsed.success).toBe(false);
  });

  it("accepts 500 characters when the browser sends CRLF line breaks", () => {
    const typed = `${"a".repeat(DESCRIPTION_MAX_LENGTH - 1)}\n`;
    const submitted = typed.replaceAll("\n", "\r\n");
    expect(submitted.length).toBeGreaterThan(DESCRIPTION_MAX_LENGTH);

    const parsed = clinicProfileSchema.safeParse({ ...base, description: submitted });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.description).toBe(typed);
    }
  });

  it("rejects a description longer than 500 characters", () => {
    const parsed = clinicProfileSchema.safeParse({
      ...base,
      description: "a".repeat(DESCRIPTION_MAX_LENGTH + 1),
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe("Tekst je predugačak.");
    }
  });

  it("lists duration options as multiples of the slot step", () => {
    expect(durationOptionsForSlot(15)).toEqual([15, 30, 45, 60, 75, 90, 105, 120]);
    expect(durationOptionsForSlot(30)).toEqual([30, 60, 90, 120]);
  });
});
