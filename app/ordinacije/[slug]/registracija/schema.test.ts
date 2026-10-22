import { describe, expect, it } from "vitest";

import {
  patientEmailCodeSchema,
  patientEmailCodeText,
  patientRegisterSchema,
  patientSignInSchema,
} from "./schema";

describe("patient auth schemas", () => {
  it("normalizes the email and requires a name", () => {
    const parsed = patientRegisterSchema.safeParse({
      firstName: " Ana ",
      lastName: "Jović",
      email: "Ana@Example.com",
      password: "lozinka",
      slug: "centar",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.email).toBe("ana@example.com");
      expect(parsed.data.firstName).toBe("Ana");
    }
  });

  it("rejects a short code", () => {
    const parsed = patientEmailCodeSchema.safeParse({ code: "12345", slug: "centar" });
    expect(parsed.success).toBe(false);
  });

  it("asks for the mail text from the product", () => {
    expect(patientEmailCodeText("123456")).toBe(
      "Kod za potvrdu mejla je 123456. Važi 10 minuta. Ako niste vi otvorili nalog, zanemarite poruku.",
    );
  });

  it("rejects an empty password on sign-in", () => {
    expect(patientSignInSchema.safeParse({ email: "ana@example.com", password: "", slug: "centar" }).success).toBe(
      false,
    );
  });
});
