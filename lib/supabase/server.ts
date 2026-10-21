import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

import { crossHostRoutingEnabled, hostFromAppUrl, isLocalHost } from "@/proxy";

/** Remembers the "Zapamti me" choice so later token refreshes keep the same cookie lifetime. */
export const REMEMBER_COOKIE = "dent_remember";

export const REMEMBER_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

/** Parent domain so the staff host (dent.) and the public host share one session. */
export function sessionCookieDomain(
  appUrl: string | undefined = process.env.APP_URL,
  staffUrl: string | undefined = process.env.STAFF_URL,
): string | undefined {
  const appHost = hostFromAppUrl(appUrl);
  if (!appHost || !crossHostRoutingEnabled(appUrl, staffUrl)) {
    return undefined;
  }
  const hostname = appHost.split(":")[0];
  return isLocalHost(hostname) ? undefined : hostname;
}

/** Without "remember" the cookie has no expiry, so it ends with the browser session. */
export function sessionCookieOptions(options: CookieOptions, remember: boolean): CookieOptions {
  const next: CookieOptions = {
    ...options,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    domain: sessionCookieDomain(),
  };
  if (options.maxAge === 0) {
    return next;
  }
  delete next.expires;
  if (remember) {
    next.maxAge = REMEMBER_MAX_AGE_SECONDS;
  } else {
    delete next.maxAge;
  }
  return next;
}

export async function createSupabaseServerClient({ remember }: { remember?: boolean } = {}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase environment variables are not set.");
  }

  const store = await cookies();
  const rememberSession = remember ?? store.get(REMEMBER_COOKIE)?.value === "1";

  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            store.set(name, value, sessionCookieOptions(options, rememberSession));
          }
        } catch {
          // Server Components cannot write cookies; Server Actions and route handlers can.
        }
      },
    },
  });
}
