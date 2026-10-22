import { describe, expect, it } from "vitest";

import {
  clinicInviteResendSchema,
  clinicInviteSchema,
  newPasswordSchema,
  passwordResetRequestSchema,
  signInSchema,
  staffInviteSchema,
} from "@/lib/schemas/auth";

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

describe("passwordResetRequestSchema", () => {
  it("normalizes the email and a clinic slug", () => {
    const result = passwordResetRequestSchema.safeParse({
      email: " Pacijent@Example.com ",
      audience: "patient",
      clinicSlug: " Ordinacija-Centar ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("pacijent@example.com");
      expect(result.data.clinicSlug).toBe("ordinacija-centar");
    }
  });

  it("drops a slug that could be a URL", () => {
    const result = passwordResetRequestSchema.safeParse({
      email: "a@b.rs",
      audience: "patient",
      clinicSlug: "https://evil.example/prijava",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clinicSlug).toBeUndefined();
    }
  });
});

describe("clinicInviteSchema", () => {
  it("keeps a six-digit code and trims the names", () => {
    const result = clinicInviteSchema.safeParse({
      token: " token ",
      clinicName: " Ordinacija ",
      firstName: " Ana ",
      lastName: " Jović ",
      code: " 123456 ",
      password: " lozinka ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        token: "token",
        clinicName: "Ordinacija",
        firstName: "Ana",
        lastName: "Jović",
        code: "123456",
        password: " lozinka ",
      });
    }
  });

  it("rejects a code that is not six digits", () => {
    const result = clinicInviteSchema.safeParse({
      token: "token",
      clinicName: "Ordinacija",
      firstName: "Ana",
      lastName: "Jović",
      code: "12345",
      password: "lozinka",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual(["Unesite kod od 6 cifara."]);
    }
  });
});

describe("staffInviteSchema", () => {
  it("keeps the code and the password and does not ask for a name", () => {
    const result = staffInviteSchema.safeParse({
      token: " token ",
      code: " 123456 ",
      password: " lozinka ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        token: "token",
        code: "123456",
        password: " lozinka ",
      });
    }
  });

  it("rejects a code that is not six digits", () => {
    const result = staffInviteSchema.safeParse({
      token: "token",
      code: "12345",
      password: "lozinka",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual(["Unesite kod od 6 cifara."]);
    }
  });
});

describe("clinicInviteResendSchema", () => {
  it("rejects an empty token", () => {
    const result = clinicInviteResendSchema.safeParse({ token: "  " });
    expect(result.success).toBe(false);
  });
});

describe("newPasswordSchema", () => {
  it("asks for a password and a token", () => {
    const empty = newPasswordSchema.safeParse({ token: "", password: "", clinicSlug: null });
    expect(empty.success).toBe(false);
    if (!empty.success) {
      expect(empty.error.issues.map((issue) => issue.message)).toEqual([
        "Ovaj link više ne važi.",
        "Unesite lozinku.",
      ]);
    }
  });
});
