import { NextRequest, NextResponse } from "next/server";
import { ar } from "@/lib/ar";
import { assertPublicHttpUrl } from "@/lib/security/url";

export const dynamic = "force-dynamic";

const FORWARD_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/json,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
} as const;

function corsHeaders(methods = "GET, POST, OPTIONS"): Headers {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", methods);
  headers.set("Cache-Control", "no-store");
  return headers;
}

async function proxyFetch(target: string, request: NextRequest): Promise<Response> {
  const method = request.method;
  const body =
    method === "POST" || method === "PUT" ? await request.arrayBuffer() : undefined;

  const upstreamHeaders: Record<string, string> = { ...FORWARD_HEADERS };
  const contentType = request.headers.get("content-type");
  if (contentType) upstreamHeaders["Content-Type"] = contentType;
  const origin = request.headers.get("origin");
  if (origin) upstreamHeaders.Origin = origin;
  const referer = request.headers.get("referer");
  if (referer) upstreamHeaders.Referer = referer;

  if (/googlevideo\.com|gvt1\.com|videoplayback/i.test(target)) {
    upstreamHeaders.Referer = "https://www.youtube.com/";
    upstreamHeaders.Origin = "https://www.youtube.com";
  }

  return fetch(target, {
    method,
    headers: upstreamHeaders,
    body: body?.byteLength ? body : undefined,
    redirect: "follow",
    signal: AbortSignal.timeout(45_000),
  });
}

function toProxyResponse(upstream: Response): NextResponse {
  const headers = corsHeaders();
  const contentType = upstream.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers,
  });
}

async function handleProxy(request: NextRequest): Promise<NextResponse> {
  const target = request.nextUrl.searchParams.get("url")?.trim();
  if (!target) {
    return NextResponse.json({ error: "Missing ?url=" }, { status: 400 });
  }

  try {
    assertPublicHttpUrl(target);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : ar.urlInvalid },
      { status: 400 }
    );
  }

  try {
    const upstream = await proxyFetch(target, request);
    return toProxyResponse(upstream);
  } catch {
    return NextResponse.json({ error: ar.unreachable }, { status: 502 });
  }
}

/** Lightweight CORS proxy — same role as a Cloudflare Worker for the PWA. */
export async function GET(request: NextRequest) {
  return handleProxy(request);
}

export async function POST(request: NextRequest) {
  return handleProxy(request);
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(),
  });
}
