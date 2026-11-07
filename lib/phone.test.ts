import { describe, expect, it } from "vitest";
import { formatPhone, normalizePhone } from "@/lib/phone";

describe("normalizePhone", () => {
  it("stores a Serbian number as +381 and 8 to 10 digits", () => {
    expect(normalizePhone("064 123 4567")).toBe("+381641234567");
    expect(normalizePhone("064/123-4567")).toBe("+381641234567");
    expect(normalizePhone("00 381 64 123 4567")).toBe("+381641234567");
    expect(normalizePhone("+381 64 123 4567")).toBe("+381641234567");
    expect(normalizePhone("+38164123456")).toBe("+38164123456");
    expect(normalizePhone("+3816412345678")).toBe("+3816412345678");
  });

  it("rejects a trunk zero, the wrong length, and a number outside Serbia", () => {
    expect(normalizePhone("+381012345678")).toBeNull();
    expect(normalizePhone("+3816412345")).toBeNull();
    expect(normalizePhone("+38164123456789")).toBeNull();
    expect(normalizePhone("641234567")).toBeNull();
    expect(normalizePhone("+4915112345678")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
});

describe("formatPhone", () => {
  it("shows a local Serbian number with the +381 prefix", () => {
    expect(formatPhone("0655258225")).toBe("+381655258225");
    expect(formatPhone("064 123 4567")).toBe("+381641234567");
    expect(formatPhone("+381655258225")).toBe("+381655258225");
  });

  it("keeps a value that is not a Serbian number", () => {
    expect(formatPhone("  123  ")).toBe("123");
    expect(formatPhone("   ")).toBeNull();
    expect(formatPhone(null)).toBeNull();
  });
});
