import { NextResponse } from "next/server";
import { ar } from "@/lib/ar";

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export function jsonApiError(message: string, status: number) {
  return NextResponse.json({ success: false as const, error: message }, { status });
}

export function safeServerMessage(err: unknown, fallback: string): string {
  const verbose =
    process.env.NODE_ENV === "development" ||
    process.env.DEPLOY_VERBOSE_ERRORS === "true";

  if (verbose && err instanceof Error) {
    return err.message.length > 300 ? err.message.slice(0, 300) + "…" : err.message;
  }
  return fallback;
}

/** أخطاء yt-dlp المُصفّاة — آمنة للعرض في الواجهة */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message && err.message !== fallback) {
    return err.message.length > 320 ? err.message.slice(0, 320) + "…" : err.message;
  }
  return safeServerMessage(err, fallback);
}

export function rateLimitedResponse(retryAfterSec: number) {
  return NextResponse.json(
    { success: false, error: ar.rateLimited },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSec) },
    }
  );
}
