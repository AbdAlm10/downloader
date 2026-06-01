import { ar } from "@/lib/ar";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
  "metadata.google.internal",
  "metadata.goog",
]);

/** Blocks SSRF to private networks and non-HTTP(S) targets. */
export function assertPublicHttpUrl(urlString: string): void {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error(ar.urlInvalid);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(ar.urlInvalid);
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (BLOCKED_HOSTNAMES.has(host) || BLOCKED_HOSTNAMES.has(parsed.hostname.toLowerCase())) {
    throw new Error(ar.urlInvalid);
  }

  if (
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^0\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw new Error(ar.urlInvalid);
  }
}
