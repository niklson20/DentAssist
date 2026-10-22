import { describe, expect, it } from "vitest";

import { ownPinState, ownPinWriteStatus } from "./pin-status";
import { accountPasswordSchema, accountPinSchema } from "./schema";

describe("account schemas", () => {
  it("asks for a password and a 6-digit PIN", () => {
    expect(accountPasswordSchema.safeParse({ password: "" }).success).toBe(false);
    expect(accountPasswordSchema.safeParse({ password: "nova-lozinka" }).success).toBe(true);
    expect(accountPinSchema.safeParse({ pin: "12345" }).success).toBe(false);
    expect(accountPinSchema.safeParse({ pin: "123456" }).success).toBe(true);
    const trimmed = accountPinSchema.safeParse({ pin: " 123456 " });
    expect(trimmed.success ? trimmed.data : null).toEqual({ pin: "123456" });
  });
});

describe("own pin status", () => {
  it("reads the write result without treating a hash as success", () => {
    expect(ownPinWriteStatus({ status: "ok" })).toBe("ok");
    expect(ownPinWriteStatus('{"status":"already_set"}')).toBe("already_set");
    expect(ownPinWriteStatus({ status: "invalid" })).toBe("invalid");
    expect(ownPinWriteStatus({ status: "ok", pin_hash: "secret" })).toBe("ok");
    expect(ownPinWriteStatus({ pin_hash: "secret" })).toBeNull();
    expect(ownPinState(true)).toBe("set");
    expect(ownPinState(false)).toBe("unset");
    expect(ownPinState(null)).toBe("unavailable");
  });
});
