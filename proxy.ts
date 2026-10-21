import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/danas", "/pacijenti", "/podesavanja", "/statistika", "/platforma"];

const AUTH_COOKIE_NAME = /^sb-[a-z0-9]+-auth-token(?:\.\d+)?$/;

export function isProtectedPath(pathname: string): boolean {
  const path = stripTrailingSlash(pathname);
  return PROTECTED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function isCronPath(pathname: string): boolean {
  const path = stripTrailingSlash(pathname);
  return path === "/api/cron" || path.startsWith("/api/cron/");
}

export function hasAuthSession(cookies: { name: string; value: string }[]): boolean {
  return cookies.some((cookie) => AUTH_COOKIE_NAME.test(cookie.name) && cookie.value.length > 0);
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isCronPath(pathname)) {
    if (!isCronAuthorized(request)) {
      return new NextResponse(null, { status: 401 });
    }
    return NextResponse.next();
  }

  if (isProtectedPath(pathname) && !hasAuthSession(request.cookies.getAll())) {
    return NextResponse.redirect(new URL("/prijava", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
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
