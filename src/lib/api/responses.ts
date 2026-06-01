import { NextResponse } from "next/server";
import { ar } from "@/lib/ar";

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export function jsonApiError(message: string, status: number) {
  return NextResponse.json({ success: false as const, error: message }, { status });
}

export function safeServerMessage(err: unknown, fallback: string): string {
  if (process.env.NODE_ENV === "development" && err instanceof Error) {
    return err.message.length > 300 ? err.message.slice(0, 300) + "…" : err.message;
  }
  return fallback;
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
