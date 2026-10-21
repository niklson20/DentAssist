import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/danas", "/pacijenti", "/podesavanja", "/statistika", "/platforma"];

const STAFF_ENTRY_PREFIXES = ["/prijava", "/za-ordinacije", "/poziv"];

const AUTH_COOKIE_NAME = /^sb-[a-z0-9]+-auth-token(?:\.\d+)?$/;

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

export function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().split(":")[0];
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

export function hostFromAppUrl(url: string | undefined): string | null {
  if (!url) {
    return null;
  }
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export function hostnameMatches(requestHost: string, configuredHost: string): boolean {
  const normalizedRequest = requestHost.toLowerCase();
  const normalizedConfigured = configuredHost.toLowerCase();
  return (
    normalizedRequest === normalizedConfigured ||
    normalizedRequest.startsWith(`${normalizedConfigured}:`)
  );
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

export function crossHostRoutingEnabled(appUrl: string | undefined, staffUrl: string | undefined): boolean {
  return Boolean(hostFromAppUrl(appUrl) && hostFromAppUrl(staffUrl));
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

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isCronPath(pathname)) {
    if (!isCronAuthorized(request)) {
      return new NextResponse(null, { status: 401 });
    }
    return NextResponse.next();
  }

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
    return NextResponse.redirect(crossHostTarget);
  }

  const sameOriginTarget = resolveSameOriginRedirect({
    ...routingInput,
    origin: request.nextUrl.origin,
  });
  if (sameOriginTarget) {
    return NextResponse.redirect(sameOriginTarget);
  }

  if (isProtectedPath(pathname) && !hasAuthSession(cookies)) {
    return NextResponse.redirect(new URL("/prijava", request.url));
  }

  return NextResponse.next();
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
