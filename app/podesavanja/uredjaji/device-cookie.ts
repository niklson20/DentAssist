import { randomBytes } from "node:crypto";

import type { CookieOptions } from "@supabase/ssr";

import { hashDeviceSecret } from "@/lib/clinic-invite";
import { sessionCookieDomain } from "@/lib/supabase/cookies";

/** Reception device cookie lasts until the owner revokes the device. */
const DEVICE_COOKIE_MAX_AGE_SECONDS = 10 * 365 * 24 * 60 * 60;

export function randomDeviceSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function deviceSecretHash(secret: string, pepper: string): string | null {
  return hashDeviceSecret(secret, pepper);
}

export function deviceCookieOptions(): CookieOptions {
  return {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    domain: sessionCookieDomain(),
    maxAge: DEVICE_COOKIE_MAX_AGE_SECONDS,
  };
}

export function clearDeviceCookieOptions(): CookieOptions {
  return {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    domain: sessionCookieDomain(),
    maxAge: 0,
  };
}
