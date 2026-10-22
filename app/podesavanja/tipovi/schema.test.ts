import { describe, expect, it } from "vitest";

import {
  addAppointmentTypeSchema,
  appointmentTypeIdSchema,
  renameAppointmentTypeSchema,
} from "./schema";

const typeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("addAppointmentTypeSchema", () => {
  it("accepts a trimmed name", () => {
    const result = addAppointmentTypeSchema.safeParse({ name: " Pregled " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Pregled");
    }
  });

  it("rejects an empty name", () => {
    const result = addAppointmentTypeSchema.safeParse({ name: "   " });
    expect(result.success).toBe(false);
  });
});

describe("renameAppointmentTypeSchema", () => {
  it("requires a type id", () => {
    const result = renameAppointmentTypeSchema.safeParse({ typeId: "", name: "Kontrola" });
    expect(result.success).toBe(false);
  });

  it("accepts a valid rename", () => {
    const result = renameAppointmentTypeSchema.safeParse({ typeId, name: "Kontrola" });
    expect(result.success).toBe(true);
  });
});

describe("appointmentTypeIdSchema", () => {
  it("rejects invalid ids", () => {
    const result = appointmentTypeIdSchema.safeParse({ typeId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });
});
