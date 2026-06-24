/** Free public CORS proxies — no own server required. Rotated on failure. */
const PUBLIC_PROXY_BUILDERS = [
  (target: string) =>
    `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
  (target: string) => `https://corsproxy.io/?${encodeURIComponent(target)}`,
  (target: string) =>
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`,
] as const;

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/json,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
} as const;

function customProxyUrl(target: string): string | null {
  const external = process.env.NEXT_PUBLIC_CORS_PROXY_URL?.trim();
  if (!external) return null;
  const base = external.includes("?url=")
    ? external
    : `${external.replace(/\/$/, "")}/proxy?url=`;
  return base + encodeURIComponent(target);
}

export function buildProxyUrls(targetUrl: string): string[] {
  const custom = customProxyUrl(targetUrl);
  const builtIn = PUBLIC_PROXY_BUILDERS.map((fn) => fn(targetUrl));
  return custom ? [custom, ...builtIn] : builtIn;
}

export async function fetchViaProxyChain(
  targetUrl: string,
  init: RequestInit = {}
): Promise<Response> {
  const urls = buildProxyUrls(targetUrl);
  let lastError: unknown;

  for (const proxyUrl of urls) {
    try {
      const res = await fetch(proxyUrl, {
        ...init,
        headers: {
          ...DEFAULT_HEADERS,
          ...(init.headers as Record<string, string> | undefined),
        },
      });
      if (res.ok) return res;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("proxy failed");
}

export async function fetchTextViaProxyChain(
  targetUrl: string,
  signal?: AbortSignal
): Promise<string> {
  const res = await fetchViaProxyChain(targetUrl, { signal });
  return res.text();
}

/** Wrap a third-party JSON API that may block browser CORS. */
export async function fetchJsonFromApi<T>(
  apiUrl: string,
  signal?: AbortSignal
): Promise<T | null> {
  try {
    const direct = await fetch(apiUrl, {
      signal,
      headers: { Accept: "application/json" },
    });
    if (direct.ok) return (await direct.json()) as T;
  } catch {
    /* try via proxy */
  }

  try {
    const wrapped = `https://api.allorigins.win/get?url=${encodeURIComponent(apiUrl)}`;
    const res = await fetch(wrapped, { signal });
    if (!res.ok) return null;
    const envelope = (await res.json()) as { contents?: string };
    if (!envelope.contents) return null;
    return JSON.parse(envelope.contents) as T;
  } catch {
    return null;
  }
}
