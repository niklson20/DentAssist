import { describe, expect, it } from "vitest";

import { signInSchema } from "@/lib/schemas/auth";

describe("signInSchema", () => {
  it("trims and lowercases the email", () => {
    const result = signInSchema.safeParse({
      email: "  Vlasnik@Example.COM ",
      password: "lozinka",
      remember: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("vlasnik@example.com");
      expect(result.data.remember).toBe(true);
    }
  });

  it("asks for an email when it is empty or missing", () => {
    for (const email of ["", "   ", null]) {
      const result = signInSchema.safeParse({ email, password: "x", remember: false });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.map((issue) => issue.message)).toEqual(["Unesite mejl."]);
      }
    }
  });

  it("rejects a malformed email in Serbian", () => {
    const result = signInSchema.safeParse({ email: "nije-mejl", password: "x", remember: false });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Unesite ispravan mejl.");
    }
  });

  it("asks for a password when it is empty or missing", () => {
    for (const password of ["", null]) {
      const result = signInSchema.safeParse({ email: "a@b.rs", password, remember: false });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.map((issue) => issue.message)).toEqual(["Unesite lozinku."]);
      }
    }
  });
});
