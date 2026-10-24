import { timingSafeEqual } from "node:crypto";

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  crossHostRoutingEnabled,
  hostFromAppUrl,
  hostnameMatches,
  isLocalHost,
} from "@/lib/hosts";
import { REMEMBER_COOKIE, sessionCookieOptions } from "@/lib/supabase/cookies";

export { crossHostRoutingEnabled, hostFromAppUrl, hostnameMatches, isLocalHost };

const PROTECTED_PREFIXES = ["/danas", "/pacijenti", "/zahtevi", "/podesavanja", "/statistika", "/platforma"];

const STAFF_ENTRY_PREFIXES = ["/prijava", "/za-ordinacije", "/poziv"];

const AUTH_COOKIE_NAME = /^sb-[a-z0-9]+-auth-token(?:\.\d+)?$/;

const SESSION_CACHE_HEADERS = ["cache-control", "expires", "pragma"] as const;

/** Set at login (2.A1); lets proxy route staff vs patient on the public host. */
export const SESSION_GATE_COOKIE = "dent_session_gate";

export type SessionGate = "anonymous" | "staff" | "platform" | "patient";

export function isProtectedPath(pathname: string): boolean {
  const path = stripTrailingSlash(pathname);
  return PROTECTED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function isStaffEntryPath(pathname: string): boolean {
  const path = stripTrailingSlash(pathname);
  return STAFF_ENTRY_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function isPublicPatientPath(pathname: string): boolean {
  const path = stripTrailingSlash(pathname);
  return path === "/ordinacije" || path.startsWith("/ordinacije/") || path === "/zakazivanje" || path.startsWith("/zakazivanje/");
}

export function isPasswordResetPath(pathname: string): boolean {
  const path = stripTrailingSlash(pathname);
  return path === "/lozinka" || path.startsWith("/lozinka/");
}

export function isCronPath(pathname: string): boolean {
  const path = stripTrailingSlash(pathname);
  return path === "/api/cron" || path.startsWith("/api/cron/");
}

export function hasAuthSession(cookies: { name: string; value: string }[]): boolean {
  return cookies.some((cookie) => AUTH_COOKIE_NAME.test(cookie.name) && cookie.value.length > 0);
}

export function resolveSessionGate(cookies: { name: string; value: string }[]): SessionGate {
  if (!hasAuthSession(cookies)) {
    return "anonymous";
  }
  const gate = cookies.find((cookie) => cookie.name === SESSION_GATE_COOKIE)?.value;
  if (gate === "staff" || gate === "platform" || gate === "patient") {
    return gate;
  }
  return "patient";
}

export function isStaffSiteHost(
  hostname: string,
  appUrl: string | undefined,
  staffUrl: string | undefined,
): boolean {
  const staffHost = hostFromAppUrl(staffUrl);
  if (!staffHost) {
    return false;
  }
  return hostnameMatches(hostname, staffHost);
}

export function isPublicSiteHost(hostname: string, appUrl: string | undefined): boolean {
  const appHost = hostFromAppUrl(appUrl);
  if (!appHost) {
    return false;
  }
  return hostnameMatches(hostname, appHost);
}

export type HostRoutingInput = {
  hostname: string;
  pathname: string;
  search: string;
  appUrl: string | undefined;
  staffUrl: string | undefined;
  sessionGate: SessionGate;
};

/** Redirect to the other site origin, or null when the request should stay on this host. */
export function resolveCrossHostRedirect(input: HostRoutingInput): string | null {
  const { hostname, pathname, search, appUrl, staffUrl, sessionGate } = input;

  if (isLocalHost(hostname) || isPasswordResetPath(pathname) || !crossHostRoutingEnabled(appUrl, staffUrl)) {
    return null;
  }

  const onStaffHost = isStaffSiteHost(hostname, appUrl, staffUrl);
  const onPublicHost = isPublicSiteHost(hostname, appUrl);
  if (!onStaffHost && !onPublicHost) {
    return null;
  }

  const path = stripTrailingSlash(pathname);
  const suffix = search || "";

  if (onPublicHost) {
    if (isProtectedPath(pathname) || isStaffEntryPath(pathname)) {
      return `${staffUrl}${pathname}${suffix}`;
    }
    if (path === "/" && (sessionGate === "staff" || sessionGate === "platform")) {
      const destination = sessionGate === "platform" ? "/platforma" : "/danas";
      return `${staffUrl}${destination}${suffix}`;
    }
    return null;
  }

  if (isPublicPatientPath(pathname)) {
    return `${appUrl}${pathname}${suffix}`;
  }

  return null;
}

export type SameOriginRoutingInput = HostRoutingInput & {
  origin: string;
};

/** Redirect on the current origin (root path and localhost staff entry). */
export function resolveSameOriginRedirect(input: SameOriginRoutingInput): string | null {
  const path = stripTrailingSlash(input.pathname);
  if (path !== "/") {
    return null;
  }

  const suffix = input.search || "";
  const { sessionGate, hostname, appUrl, staffUrl, origin } = input;

  if (sessionGate === "staff") {
    return `${origin}/danas${suffix}`;
  }
  if (sessionGate === "platform") {
    return `${origin}/platforma${suffix}`;
  }

  if (!isLocalHost(hostname) && isStaffSiteHost(hostname, appUrl, staffUrl)) {
    return `${origin}/prijava${suffix}`;
  }

  return null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isCronPath(pathname)) {
    if (!isCronAuthorized(request)) {
      return new NextResponse(null, { status: 401 });
    }
    return NextResponse.next();
  }

  const sessionResponse = await refreshSession(request);
  const cookies = request.cookies.getAll();
  const sessionGate = resolveSessionGate(cookies);
  const appUrl = process.env.APP_URL;
  const staffUrl = process.env.STAFF_URL;
  const hostname = request.nextUrl.hostname;
  const search = request.nextUrl.search;

  const routingInput: HostRoutingInput = {
    hostname,
    pathname,
    search,
    appUrl,
    staffUrl,
    sessionGate,
  };

  const crossHostTarget = resolveCrossHostRedirect(routingInput);
  if (crossHostTarget) {
    return carrySession(NextResponse.redirect(crossHostTarget), sessionResponse);
  }

  const sameOriginTarget = resolveSameOriginRedirect({
    ...routingInput,
    origin: request.nextUrl.origin,
  });
  if (sameOriginTarget) {
    return carrySession(NextResponse.redirect(sameOriginTarget), sessionResponse);
  }

  if (isProtectedPath(pathname) && !hasAuthSession(cookies)) {
    return carrySession(NextResponse.redirect(new URL("/prijava", request.url)), sessionResponse);
  }

  return sessionResponse;
}

export const config = {
  matcher: [
    "/",
    "/prijava",
    "/prijava/:path*",
    "/danas",
    "/danas/:path*",
    "/pacijenti",
    "/pacijenti/:path*",
    "/zahtevi",
    "/zahtevi/:path*",
    "/podesavanja",
    "/podesavanja/:path*",
    "/statistika",
    "/statistika/:path*",
    "/platforma",
    "/platforma/:path*",
    "/api/cron",
    "/api/cron/:path*",
    "/za-ordinacije",
    "/za-ordinacije/:path*",
    "/ordinacije",
    "/ordinacije/:path*",
    "/zakazivanje",
    "/zakazivanje/:path*",
    "/poziv",
    "/poziv/:path*",
    "/lozinka",
    "/lozinka/:path*",
  ],
};

/** Server Components cannot store a refreshed token, so the proxy writes it before they run. */
async function refreshSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return response;
  }

  const remember = request.cookies.get(REMEMBER_COOKIE)?.value === "1";
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, sessionCookieOptions(options, remember));
        }
        for (const [header, value] of Object.entries(headers)) {
          response.headers.set(header, value);
        }
      },
    },
  });

  await supabase.auth.getClaims();
  return response;
}

/** A new redirect drops cookies set on the refreshed response. */
function carrySession(target: NextResponse, source: NextResponse): NextResponse {
  for (const cookie of source.headers.getSetCookie()) {
    target.headers.append("set-cookie", cookie);
  }
  for (const header of SESSION_CACHE_HEADERS) {
    const value = source.headers.get(header);
    if (value) {
      target.headers.set(header, value);
    }
  }
  return target;
}

function isCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }
  const header = request.headers.get("authorization");
  const match = header ? /^Bearer (.+)$/i.exec(header) : null;
  if (!match?.[1]) {
    return false;
  }
  const given = Buffer.from(match[1]);
  const expected = Buffer.from(secret);
  if (given.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(given, expected);
}

function stripTrailingSlash(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}
