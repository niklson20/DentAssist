import { describe, expect, it } from "vitest";

import { staffInviteSendSchema, transferOwnershipSchema } from "./schema";

describe("staffInviteSendSchema", () => {
  it("accepts a dentist invite", () => {
    const result = staffInviteSendSchema.safeParse({
      firstName: "Mila",
      lastName: "Jović",
      email: "mila@example.com",
      role: "dentist",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing email", () => {
    const result = staffInviteSendSchema.safeParse({
      firstName: "Mila",
      lastName: "Jović",
      email: "",
      role: "reception",
    });
    expect(result.success).toBe(false);
  });
});

describe("transferOwnershipSchema", () => {
  it("requires a member id", () => {
    const result = transferOwnershipSchema.safeParse({ targetMemberId: "" });
    expect(result.success).toBe(false);
  });
});
