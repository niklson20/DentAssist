import { describe, expect, it } from "vitest";

import {
  hasAuthSession,
  isCronPath,
  isProtectedPath,
  resolveCrossHostRedirect,
  resolveSameOriginRedirect,
  resolveSessionGate,
  SESSION_GATE_COOKIE,
} from "@/proxy";

const APP_URL = "https://dentassist.rs";
const STAFF_URL = "https://dent.dentassist.rs";

const authCookies = [
  { name: "sb-aaaaaaaaaaaaaaaaaaaa-auth-token", value: "session" },
  { name: SESSION_GATE_COOKIE, value: "staff" },
];

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

  it("defaults authenticated users without a gate cookie to patient", () => {
    expect(
      resolveSessionGate([{ name: "sb-aaaaaaaaaaaaaaaaaaaa-auth-token", value: "session" }]),
    ).toBe("patient");
    expect(resolveSessionGate(authCookies)).toBe("staff");
  });
});

describe("dual-host routing", () => {
  it("moves /danas from the public host to dent.", () => {
    expect(
      resolveCrossHostRedirect({
        hostname: "dentassist.rs",
        pathname: "/danas",
        search: "",
        appUrl: APP_URL,
        staffUrl: STAFF_URL,
        sessionGate: "anonymous",
      }),
    ).toBe("https://dent.dentassist.rs/danas");
  });

  it("moves signed-in staff from public / to dent. and /danas", () => {
    expect(
      resolveCrossHostRedirect({
        hostname: "dentassist.rs",
        pathname: "/",
        search: "",
        appUrl: APP_URL,
        staffUrl: STAFF_URL,
        sessionGate: "staff",
      }),
    ).toBe("https://dent.dentassist.rs/danas");
  });

  it("moves /ordinacije/[slug] from dent. to the public host", () => {
    expect(
      resolveCrossHostRedirect({
        hostname: "dent.dentassist.rs",
        pathname: "/ordinacije/demo-klinika",
        search: "?grad=Beograd",
        appUrl: APP_URL,
        staffUrl: STAFF_URL,
        sessionGate: "anonymous",
      }),
    ).toBe("https://dentassist.rs/ordinacije/demo-klinika?grad=Beograd");
  });

  it("sends dent. / without a session to prijava instead of the directory", () => {
    expect(
      resolveSameOriginRedirect({
        hostname: "dent.dentassist.rs",
        pathname: "/",
        search: "",
        appUrl: APP_URL,
        staffUrl: STAFF_URL,
        sessionGate: "anonymous",
        origin: STAFF_URL,
      }),
    ).toBe("https://dent.dentassist.rs/prijava");
  });

  it("keeps localhost on the same origin", () => {
    expect(
      resolveCrossHostRedirect({
        hostname: "localhost",
        pathname: "/danas",
        search: "",
        appUrl: APP_URL,
        staffUrl: STAFF_URL,
        sessionGate: "anonymous",
      }),
    ).toBeNull();

    expect(
      resolveSameOriginRedirect({
        hostname: "localhost",
        pathname: "/",
        search: "",
        appUrl: APP_URL,
        staffUrl: STAFF_URL,
        sessionGate: "anonymous",
        origin: "http://localhost:3000",
      }),
    ).toBeNull();

    expect(
      resolveSameOriginRedirect({
        hostname: "localhost",
        pathname: "/",
        search: "",
        appUrl: APP_URL,
        staffUrl: STAFF_URL,
        sessionGate: "staff",
        origin: "http://localhost:3000",
      }),
    ).toBe("http://localhost:3000/danas");
  });

  it("leaves a patient on the public directory", () => {
    expect(
      resolveCrossHostRedirect({
        hostname: "dentassist.rs",
        pathname: "/",
        search: "",
        appUrl: APP_URL,
        staffUrl: STAFF_URL,
        sessionGate: "patient",
      }),
    ).toBeNull();
  });
});
