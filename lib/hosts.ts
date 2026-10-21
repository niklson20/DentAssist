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

export function crossHostRoutingEnabled(appUrl: string | undefined, staffUrl: string | undefined): boolean {
  return Boolean(hostFromAppUrl(appUrl) && hostFromAppUrl(staffUrl));
}
