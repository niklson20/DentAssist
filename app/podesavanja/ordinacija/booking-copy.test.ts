import { describe, expect, it } from "vitest";

import { bookingSummary, bufferHint, nearestDuration, noticeReading, slotHint } from "./booking-copy";

describe("booking copy", () => {
  it("snaps duration to the nearest multiple, preferring the shorter one on a tie", () => {
    expect(nearestDuration(30, 15)).toBe(30);
    expect(nearestDuration(45, 30)).toBe(30);
    expect(nearestDuration(50, 30)).toBe(60);
    expect(nearestDuration(10, 15)).toBe(15);
  });

  it("describes the slot step and the gap", () => {
    expect(slotHint(15)).toBe("Termini počinju na svakih 15 minuta.");
    expect(bufferHint(0)).toBe("Nema pauze posle termina.");
    expect(bufferHint(10)).toBe("Pauza posle svakog termina je 10 minuta.");
  });

  it("reads notice in hours and builds the patient summary", () => {
    expect(noticeReading(0)).toBe("odmah");
    expect(noticeReading(45)).toBe("za 45 minuta");
    expect(noticeReading(60)).toBe("za 1 sat");
    expect(noticeReading(120)).toBe("za 2 sata");
    expect(noticeReading(90)).toBe("za 1 sat i 30 minuta");
    expect(bookingSummary(30, 120, 30)).toBe(
      "Pacijent bira termin od 30 minuta, najranije za 2 sata i najdalje 30 dana unapred.",
    );
    expect(bookingSummary(30, 0, 0)).toBe(
      "Pacijent bira termin od 30 minuta, najranije odmah i najdalje danas.",
    );
    expect(bookingSummary(15, 60, 21)).toBe(
      "Pacijent bira termin od 15 minuta, najranije za 1 sat i najdalje 21 dan unapred.",
    );
  });
});
