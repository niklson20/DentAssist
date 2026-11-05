import { headers } from "next/headers";

import { staffEntryHref } from "@/lib/staff-entry";

export async function resolveStaffEntryUrl(): Promise<string> {
  const store = await headers();
  const host = store.get("x-forwarded-host") ?? store.get("host");
  const proto =
    store.get("x-forwarded-proto") ??
    (host?.startsWith("localhost") || host?.startsWith("127.0.0.1") ? "http" : "https");

  return staffEntryHref({
    staffUrl: process.env.STAFF_URL,
    appUrl: process.env.APP_URL,
    requestOrigin: host ? `${proto}://${host}` : null,
  });
}
