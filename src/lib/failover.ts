/** عنوان Render الاحتياطي — يُضبط على Railway فقط */
export function getFallbackOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_FALLBACK_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function isOnFallbackHost(): boolean {
  if (typeof window === "undefined") return false;
  const fallback = getFallbackOrigin();
  return fallback !== null && window.location.origin === fallback;
}

export function buildFailoverRedirectUrl(): string | null {
  if (typeof window === "undefined") return null;
  const fallback = getFallbackOrigin();
  if (!fallback || isOnFallbackHost()) return null;
  return `${fallback}${window.location.pathname}${window.location.search}`;
}

const FAILOVER_SESSION_KEY = "almonzel-failover-used";

export function markFailoverUsed(): void {
  try {
    sessionStorage.setItem(FAILOVER_SESSION_KEY, "1");
  } catch {
    /* private mode */
  }
}

export function wasFailoverUsedThisSession(): boolean {
  try {
    return sessionStorage.getItem(FAILOVER_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

/** حالات تعني أن الخادم الرئيسي (Railway) غير متاح */
export function shouldFailoverFromResponse(status: number): boolean {
  return status === 402 || status === 403 || status === 502 || status === 503 || status === 504;
}

export const FAILOVER_HEALTH_TIMEOUT_MS = 4_500;
