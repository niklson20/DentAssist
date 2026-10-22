import { describe, expect, it } from "vitest";

import { legalDataSchema } from "./schema";

describe("legalDataSchema", () => {
  it("accepts empty fields as null", () => {
    const result = legalDataSchema.safeParse({
      taxId: "   ",
      registrationNumber: "",
      licenseNumber: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        taxId: null,
        registrationNumber: null,
        licenseNumber: null,
      });
    }
  });

  it("trims non-empty values", () => {
    const result = legalDataSchema.safeParse({
      taxId: " 123456789 ",
      registrationNumber: " 123 ",
      licenseNumber: " AB-1 ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        taxId: "123456789",
        registrationNumber: "123",
        licenseNumber: "AB-1",
      });
    }
  });

  it("rejects values that are too long", () => {
    const result = legalDataSchema.safeParse({
      taxId: "a".repeat(51),
      registrationNumber: "",
      licenseNumber: "",
    });
    expect(result.success).toBe(false);
  });
});
