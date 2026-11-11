import { describe, expect, it } from "vitest";

import {
  normalizeClinicSlug,
  passwordResetLink,
  pathAfterPasswordReset,
} from "@/lib/password-reset";

describe("normalizeClinicSlug", () => {
  it("keeps a real clinic slug", () => {
    expect(normalizeClinicSlug("Centar")).toBe("centar");
  });

  it("drops values that are not clinic paths", () => {
    expect(normalizeClinicSlug("https://evil.example")).toBeUndefined();
    expect(normalizeClinicSlug("")).toBeUndefined();
  });
});

describe("passwordResetLink", () => {
  it("builds a patient link with an optional clinic query", () => {
    expect(
      passwordResetLink({
        audience: "patient",
        token: "token-1",
        clinicSlug: "centar",
        appUrl: "https://dentassist.rs",
      }),
    ).toBe("https://dentassist.rs/lozinka/token-1?ordinacija=centar");
  });

  it("omits the clinic query when the slug is missing", () => {
    expect(
      passwordResetLink({
        audience: "patient",
        token: "token-1",
        appUrl: "https://dentassist.rs",
      }),
    ).toBe("https://dentassist.rs/lozinka/token-1");
  });
});

describe("pathAfterPasswordReset", () => {
  it("sends staff and platform to staff login", () => {
    expect(pathAfterPasswordReset("staff", undefined)).toBe("/prijava");
    expect(pathAfterPasswordReset("platform", "centar")).toBe("/prijava");
  });

  it("sends a patient with a clinic slug back to that clinic login", () => {
    expect(pathAfterPasswordReset("patient", "centar")).toBe("/ordinacije/centar/prijava");
  });

  it("sends a patient without a clinic slug to the global login", () => {
    expect(pathAfterPasswordReset("patient", undefined)).toBe("/nalog/prijava");
  });
});
