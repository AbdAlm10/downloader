"use client";

import { useEffect } from "react";
import {
  buildFailoverRedirectUrl,
  FAILOVER_HEALTH_TIMEOUT_MS,
  isOnFallbackHost,
  markFailoverUsed,
  shouldFailoverFromResponse,
  wasFailoverUsedThisSession,
} from "@/lib/failover";

function redirectToFallback(): void {
  const target = buildFailoverRedirectUrl();
  if (!target) return;
  markFailoverUsed();
  window.location.replace(target);
}

async function probePrimaryHealth(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FAILOVER_HEALTH_TIMEOUT_MS);

  try {
    const res = await fetch("/api/health", {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (shouldFailoverFromResponse(res.status)) return false;
    return res.ok;
  } catch {
    clearTimeout(timer);
    return false;
  }
}

/** نسخة احتياطية بعد تحميل React إن فشل السكربت المبكر */
export function useFailover() {
  useEffect(() => {
    if (isOnFallbackHost() || wasFailoverUsedThisSession()) return;
    if (!buildFailoverRedirectUrl()) return;

    void probePrimaryHealth().then((ok) => {
      if (!ok) redirectToFallback();
    });
  }, []);
}
