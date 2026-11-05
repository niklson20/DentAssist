import { hostFromAppUrl, hostnameMatches, isLocalHost } from "@/lib/hosts";

/**
 * Directory link to the staff door.
 * A separate staff host keeps its root, because that host sends `/` to login.
 * The same host, including local dev, serves the directory at `/`, so the link opens login directly.
 */
export function staffEntryHref(input: {
  staffUrl?: string;
  appUrl?: string;
  requestOrigin?: string | null;
}): string {
  const staff = originOf(input.staffUrl);
  const app = originOf(input.appUrl);
  const here = originOf(input.requestOrigin ?? undefined);
  const target = staff ?? here;
  if (!target) {
    return "/prijava";
  }

  const targetHost = hostFromAppUrl(target);
  const appHost = app ? hostFromAppUrl(app) : null;
  const sharesDirectory =
    staff === null ||
    (targetHost !== null && isLocalHost(targetHost)) ||
    (targetHost !== null && appHost !== null && hostnameMatches(targetHost, appHost));

  if (sharesDirectory) {
    return `${target}/prijava`;
  }
  return target;
}

/**
 * Staff login link back to the patient directory.
 * A separate public host is that directory.
 * The same host, including local dev, serves the directory at `/`.
 */
export function patientDirectoryHref(input: {
  staffUrl?: string;
  appUrl?: string;
  requestOrigin?: string | null;
}): string {
  const staff = originOf(input.staffUrl);
  const app = originOf(input.appUrl);
  const here = originOf(input.requestOrigin ?? undefined);
  const hereHost = here ? hostFromAppUrl(here) : null;
  if (!hereHost || isLocalHost(hereHost)) {
    return "/";
  }

  const appHost = app ? hostFromAppUrl(app) : null;
  const staffHost = staff ? hostFromAppUrl(staff) : null;
  if (app && appHost && staffHost && !isLocalHost(appHost) && !hostnameMatches(staffHost, appHost)) {
    return app;
  }

  return "/";
}

function originOf(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}
