import { describe, expect, it } from "vitest";

import { hasAuthSession, isCronPath, isProtectedPath } from "@/proxy";

describe("route gate", () => {
  it("protects staff paths and their children", () => {
    expect(isProtectedPath("/danas")).toBe(true);
    expect(isProtectedPath("/pacijenti/1")).toBe(true);
    expect(isProtectedPath("/podesavanja/nalog")).toBe(true);
    expect(isProtectedPath("/statistika")).toBe(true);
    expect(isProtectedPath("/platforma")).toBe(true);
    expect(isProtectedPath("/danas/")).toBe(true);
  });

  it("leaves public paths open", () => {
    for (const path of [
      "/",
      "/za-ordinacije",
      "/ordinacije/demo",
      "/ordinacije/demo/zakazivanje",
      "/zakazivanje/token",
      "/poziv/token",
      "/lozinka/token",
      "/prijava",
    ]) {
      expect(isProtectedPath(path)).toBe(false);
    }
  });

  it("does not treat a prefix collision as protected", () => {
    expect(isProtectedPath("/danasni")).toBe(false);
    expect(isProtectedPath("/pacijent")).toBe(false);
  });

  it("recognizes cron and a supabase auth cookie", () => {
    expect(isCronPath("/api/cron")).toBe(true);
    expect(isCronPath("/api/cron/reminders")).toBe(true);
    expect(isCronPath("/api/other")).toBe(false);
    expect(
      hasAuthSession([{ name: "sb-aaaaaaaaaaaaaaaaaaaa-auth-token", value: "session" }]),
    ).toBe(true);
    expect(hasAuthSession([{ name: "sb-aaaaaaaaaaaaaaaaaaaa-auth-token", value: "" }])).toBe(
      false,
    );
    expect(hasAuthSession([{ name: "clinic_device", value: "secret" }])).toBe(false);
  });
});
