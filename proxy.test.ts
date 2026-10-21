import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { createServerClient } = vi.hoisted(() => ({
  createServerClient: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient,
}));

import { REMEMBER_COOKIE, REMEMBER_MAX_AGE_SECONDS } from "@/lib/supabase/cookies";
import {
  hasAuthSession,
  isCronPath,
  isProtectedPath,
  proxy,
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

const AUTH_COOKIE = "sb-aaaaaaaaaaaaaaaaaaaa-auth-token";
const SUPABASE_URL = "https://example.supabase.co";
const SUPABASE_KEY = "publishable-key";

type CookieBag = {
  cookies: {
    setAll: (
      cookiesToSet: { name: string; value: string; options: { path: string; maxAge: number } }[],
      headers: Record<string, string>,
    ) => void;
  };
};

describe("session refresh", () => {
  afterEach(() => {
    createServerClient.mockReset();
    vi.unstubAllEnvs();
  });

  it("writes the refreshed cookie onto the page response and a redirect when remembered", async () => {
    stubSupabase();
    refreshOnClaims();

    const page = await proxy(
      incoming("https://dent.dentassist.rs/danas", [
        { name: AUTH_COOKIE, value: "expired" },
        { name: SESSION_GATE_COOKIE, value: "staff" },
        { name: REMEMBER_COOKIE, value: "1" },
      ]),
    );
    expect(page.status).toBe(200);
    expect(setCookie(page, AUTH_COOKIE)).toContain(`Max-Age=${REMEMBER_MAX_AGE_SECONDS}`);
    expect(setCookie(page, AUTH_COOKIE)).toContain("Domain=dentassist.rs");
    expect(page.headers.get("cache-control")).toContain("no-store");

    const redirect = await proxy(
      incoming("https://dentassist.rs/danas", [
        { name: AUTH_COOKIE, value: "expired" },
        { name: SESSION_GATE_COOKIE, value: "staff" },
        { name: REMEMBER_COOKIE, value: "1" },
      ]),
    );
    expect(redirect.headers.get("location")).toBe("https://dent.dentassist.rs/danas");
    expect(setCookie(redirect, AUTH_COOKIE)).toContain("refreshed");
    expect(setCookie(redirect, AUTH_COOKIE)).toContain(`Max-Age=${REMEMBER_MAX_AGE_SECONDS}`);
    expect(setCookie(redirect, AUTH_COOKIE)).toContain("Domain=dentassist.rs");
    expect(redirect.headers.get("cache-control")).toContain("no-store");
    expect(redirect.headers.get("expires")).toBe("0");
    expect(redirect.headers.get("pragma")).toBe("no-cache");
  });

  it("omits max-age when the session ends with the browser", async () => {
    stubSupabase();
    refreshOnClaims();

    const page = await proxy(
      incoming("https://dent.dentassist.rs/danas", [
        { name: AUTH_COOKIE, value: "expired" },
        { name: SESSION_GATE_COOKIE, value: "staff" },
      ]),
    );
    expect(setCookie(page, AUTH_COOKIE)).not.toMatch(/Max-Age/i);

    const redirect = await proxy(
      incoming("https://dentassist.rs/danas", [
        { name: AUTH_COOKIE, value: "expired" },
        { name: SESSION_GATE_COOKIE, value: "staff" },
      ]),
    );
    expect(redirect.headers.get("location")).toBe("https://dent.dentassist.rs/danas");
    expect(setCookie(redirect, AUTH_COOKIE)).toContain("refreshed");
    expect(setCookie(redirect, AUTH_COOKIE)).not.toMatch(/Max-Age/i);
    expect(setCookie(redirect, AUTH_COOKIE)).toContain("Domain=dentassist.rs");
  });

  it("sends a protected path without a session to prijava", async () => {
    stubSupabase();
    createServerClient.mockImplementation(() => ({
      auth: { getClaims: async () => ({ data: { claims: null }, error: null }) },
    }));

    const response = await proxy(incoming("https://dent.dentassist.rs/danas", []));
    expect(response.headers.get("location")).toBe("https://dent.dentassist.rs/prijava");
    expect(createServerClient).toHaveBeenCalledOnce();
  });

  it("does not call supabase for cron", async () => {
    stubSupabase();
    refreshOnClaims();

    const response = await proxy(incoming("https://dent.dentassist.rs/api/cron", []));
    expect(response.status).toBe(401);
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("keeps routing when supabase env is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");

    const response = await proxy(incoming("https://dentassist.rs/za-ordinacije", []));
    expect(response.status).toBe(200);
    expect(createServerClient).not.toHaveBeenCalled();
  });
});

function stubSupabase() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", SUPABASE_KEY);
  vi.stubEnv("APP_URL", APP_URL);
  vi.stubEnv("STAFF_URL", STAFF_URL);
}

function refreshOnClaims() {
  createServerClient.mockImplementation((_url: string, _key: string, options: CookieBag) => ({
    auth: {
      getClaims: async () => {
        options.cookies.setAll(
          [{ name: AUTH_COOKIE, value: "refreshed", options: { path: "/", maxAge: 3600 } }],
          {
            "cache-control": "private, no-cache, no-store, must-revalidate, max-age=0",
            expires: "0",
            pragma: "no-cache",
          },
        );
        return { data: { claims: { sub: "user" } }, error: null };
      },
    },
  }));
}

function incoming(url: string, cookies: { name: string; value: string }[]) {
  const header = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  return new NextRequest(url, { headers: header ? { cookie: header } : {} });
}

function setCookie(response: Response, name: string): string {
  const header = response.headers.getSetCookie().find((cookie) => cookie.startsWith(`${name}=`));
  expect(header).toBeDefined();
  return header ?? "";
}
