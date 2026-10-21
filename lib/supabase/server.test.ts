import { afterEach, describe, expect, it, vi } from "vitest";

import {
  REMEMBER_MAX_AGE_SECONDS,
  sessionCookieDomain,
  sessionCookieOptions,
} from "@/lib/supabase/server";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sessionCookieDomain", () => {
  it("uses the public host so the dent. host shares the cookie", () => {
    expect(sessionCookieDomain("https://dentassist.rs", "https://dent.dentassist.rs")).toBe("dentassist.rs");
  });

  it("drops the port", () => {
    expect(sessionCookieDomain("https://dentassist.rs:8443", "https://dent.dentassist.rs:8443")).toBe(
      "dentassist.rs",
    );
  });

  it("stays host-only without a second name or on localhost", () => {
    expect(sessionCookieDomain("https://dentassist.rs", undefined)).toBeUndefined();
    expect(sessionCookieDomain(undefined, undefined)).toBeUndefined();
    expect(sessionCookieDomain("http://localhost:3000", "http://dent.localhost:3000")).toBeUndefined();
  });
});

describe("sessionCookieOptions", () => {
  it("keeps the session for 90 days when remembered", () => {
    const options = sessionCookieOptions({ maxAge: 400 * 24 * 60 * 60, path: "/" }, true);
    expect(options.maxAge).toBe(REMEMBER_MAX_AGE_SECONDS);
    expect(REMEMBER_MAX_AGE_SECONDS).toBe(90 * 24 * 60 * 60);
  });

  it("ends with the browser session when not remembered", () => {
    const options = sessionCookieOptions(
      { maxAge: 400 * 24 * 60 * 60, expires: new Date("2030-01-01T00:00:00Z") },
      false,
    );
    expect(options.maxAge).toBeUndefined();
    expect(options.expires).toBeUndefined();
  });

  it("leaves a removal untouched so the cookie is still deleted", () => {
    expect(sessionCookieOptions({ maxAge: 0 }, true).maxAge).toBe(0);
    expect(sessionCookieOptions({ maxAge: 0 }, false).maxAge).toBe(0);
  });

  it("is HttpOnly and Lax, and Secure only in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(sessionCookieOptions({}, false)).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true, path: "/" });
    vi.stubEnv("NODE_ENV", "development");
    expect(sessionCookieOptions({}, false).secure).toBe(false);
  });

  it("applies the parent domain from the environment", () => {
    vi.stubEnv("APP_URL", "https://dentassist.rs");
    vi.stubEnv("STAFF_URL", "https://dent.dentassist.rs");
    expect(sessionCookieOptions({}, false).domain).toBe("dentassist.rs");
  });
});
