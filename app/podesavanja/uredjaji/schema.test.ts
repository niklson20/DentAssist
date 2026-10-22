import { describe, expect, it } from "vitest";

import { deviceIdSchema, pairDeviceSchema } from "./schema";

describe("pairDeviceSchema", () => {
  it("accepts a trimmed label", () => {
    const parsed = pairDeviceSchema.safeParse({ label: "  Recepcija  " });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.label).toBe("Recepcija");
    }
  });

  it("rejects an empty label", () => {
    expect(pairDeviceSchema.safeParse({ label: "" }).success).toBe(false);
  });
});

describe("deviceIdSchema", () => {
  it("rejects a non-uuid id", () => {
    expect(deviceIdSchema.safeParse({ deviceId: "x" }).success).toBe(false);
  });
});
