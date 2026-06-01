import { ar } from "@/lib/ar";
import { checkRateLimit, clientIp } from "./rate-limit";
import { rateLimitedResponse } from "./responses";

type RouteKind = "info" | "download" | "health";

const LIMITS: Record<RouteKind, { limit: number; windowMs: number }> = {
  info: { limit: 20, windowMs: 60_000 },
  download: { limit: 15, windowMs: 60_000 },
  health: { limit: 60, windowMs: 60_000 },
};

export function guardRequest(request: Request, kind: RouteKind) {
  const { limit, windowMs } = LIMITS[kind];
  const ip = clientIp(request);
  const result = checkRateLimit(`${kind}:${ip}`, limit, windowMs);

  if (!result.allowed) {
    return rateLimitedResponse(result.retryAfterSec ?? 60);
  }

  return null;
}

const MAX_INFO_BODY = 4_096;

export async function parseJsonBody(request: Request): Promise<unknown> {
  const length = request.headers.get("content-length");
  if (length && parseInt(length, 10) > MAX_INFO_BODY) {
    throw new Error(ar.requestTooLarge);
  }

  const text = await request.text();
  if (text.length > MAX_INFO_BODY) {
    throw new Error(ar.requestTooLarge);
  }

  return text ? JSON.parse(text) : {};
}
