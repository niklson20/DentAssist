import { describe, expect, it } from "vitest";

import { guideProfileSchema, guideSchedulingSchema } from "./schema";

describe("guide schemas", () => {
  it("accepts a valid profile", () => {
    const parsed = guideProfileSchema.safeParse({
      name: "Ordinacija",
      city: "Beograd",
      address: "Knez Mihailova 1",
      phone: "0601234567",
    });
    expect(parsed.success).toBe(true);
  });

  it("requires duration to match the slot step", () => {
    const parsed = guideSchedulingSchema.safeParse({
      typeName: "Pregled",
      slotMinutes: 30,
      bufferMinutes: 0,
      defaultDurationMin: 25,
    });
    expect(parsed.success).toBe(false);
  });
});
