import { ar } from "./ar";
import { isStaticOnly } from "./static-mode";

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/json,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
} as const;

/** External Worker (`https://x.workers.dev/proxy?url=`) or same-origin `/api/proxy?url=` when not static. */
export function getProxyFetchUrl(targetUrl: string): string {
  const external = process.env.NEXT_PUBLIC_CORS_PROXY_URL?.trim();
  if (external) {
    const base = external.includes("?url=")
      ? external
      : `${external.replace(/\/$/, "")}/proxy?url=`;
    return base + encodeURIComponent(targetUrl);
  }
  if (isStaticOnly()) {
    throw new Error(ar.staticProxyRequired);
  }
  return `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
}

export async function fetchViaProxy(
  targetUrl: string,
  init: RequestInit = {}
): Promise<Response> {
  const res = await fetch(getProxyFetchUrl(targetUrl), {
    ...init,
    headers: {
      ...DEFAULT_HEADERS,
      ...(init.headers as Record<string, string> | undefined),
    },
  });

  if (!res.ok) {
    throw new Error(`${ar.unreachable} (${res.status})`);
  }

  return res;
}

export async function fetchTextViaProxy(targetUrl: string, signal?: AbortSignal): Promise<string> {
  const res = await fetchViaProxy(targetUrl, { signal });
  return res.text();
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

/** Try direct fetch first; fall back to CORS proxy when blocked. */
export async function downloadMediaUrl(
  mediaUrl: string,
  options: {
    signal?: AbortSignal;
    onProgress?: (loaded: number, total: number | null) => void;
  } = {}
): Promise<Blob> {
  try {
    const direct = await fetch(mediaUrl, {
      signal: options.signal,
      headers: DEFAULT_HEADERS,
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
