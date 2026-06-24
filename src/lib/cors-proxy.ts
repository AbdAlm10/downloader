import { ar } from "./ar";
import { isStaticOnly } from "./static-mode";
import {
  buildProxyUrls,
  fetchViaProxyChain,
  fetchTextViaProxyChain as fetchTextChain,
} from "./public-cors-proxies";

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/json,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
} as const;

/** Built-in free proxies, optional custom worker, or same-origin `/api/proxy` in server mode. */
export function getProxyFetchUrl(targetUrl: string): string {
  return buildProxyUrls(targetUrl)[0]!;
}

export async function fetchViaProxy(
  targetUrl: string,
  init: RequestInit = {}
): Promise<Response> {
  if (!isStaticOnly()) {
    const external = process.env.NEXT_PUBLIC_CORS_PROXY_URL?.trim();
    if (!external) {
      try {
        const res = await fetch(`/api/proxy?url=${encodeURIComponent(targetUrl)}`, init);
        if (res.ok) return res;
      } catch {
        /* fall through to public proxies */
      }
    }
  }

  try {
    return await fetchViaProxyChain(targetUrl, init);
  } catch (err) {
    throw err instanceof Error ? err : new Error(ar.unreachable);
  }
}

export async function fetchTextViaProxy(targetUrl: string, signal?: AbortSignal): Promise<string> {
  if (!isStaticOnly()) {
    try {
      const res = await fetch(`/api/proxy?url=${encodeURIComponent(targetUrl)}`, { signal });
      if (res.ok) return res.text();
    } catch {
      /* use chain */
    }
  }
  return fetchTextChain(targetUrl, signal);
}

async function readResponseBlob(
  res: Response,
  options: {
    signal?: AbortSignal;
    onProgress?: (loaded: number, total: number | null) => void;
  }
): Promise<Blob> {
  const totalHeader = res.headers.get("Content-Length");
  const total = totalHeader ? parseInt(totalHeader, 10) : null;
  const validTotal = total && Number.isFinite(total) && total > 0 ? total : null;

  if (!res.body) {
    const blob = await res.blob();
    options.onProgress?.(blob.size, blob.size);
    return blob;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  options.onProgress?.(0, validTotal);

  while (true) {
    if (options.signal?.aborted) {
      await reader.cancel();
      throw new DOMException("Aborted", "AbortError");
    }
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.byteLength;
      options.onProgress?.(loaded, validTotal);
    }
  }

  const blob = new Blob(chunks as BlobPart[]);
  options.onProgress?.(blob.size, validTotal ?? blob.size);
  return blob;
}

const CDN_REFERERS: { pattern: RegExp; referer: string }[] = [
  { pattern: /tiktok|tikwm|muscdn/i, referer: "https://www.tiktok.com/" },
  { pattern: /instagram|cdninstagram/i, referer: "https://www.instagram.com/" },
  { pattern: /fbcdn|facebook/i, referer: "https://www.facebook.com/" },
  { pattern: /twimg|twitter/i, referer: "https://twitter.com/" },
];

function refererForUrl(mediaUrl: string): string | undefined {
  return CDN_REFERERS.find((r) => r.pattern.test(mediaUrl))?.referer;
}

/** Try direct fetch first; fall back to free CORS proxy chain when blocked. */
export async function downloadMediaUrl(
  mediaUrl: string,
  options: {
    signal?: AbortSignal;
    onProgress?: (loaded: number, total: number | null) => void;
  } = {}
): Promise<Blob> {
  const referer = refererForUrl(mediaUrl);
  const fetchHeaders: Record<string, string> = { ...DEFAULT_HEADERS };
  if (referer) fetchHeaders.Referer = referer;

  try {
    const direct = await fetch(mediaUrl, {
      signal: options.signal,
      headers: fetchHeaders,
      credentials: "omit",
    });
    if (direct.ok) {
      return readResponseBlob(direct, options);
    }
  } catch {
    /* CORS or network — use proxy */
  }

  const proxied = await fetchViaProxy(mediaUrl, { signal: options.signal });
  return readResponseBlob(proxied, options);
}
