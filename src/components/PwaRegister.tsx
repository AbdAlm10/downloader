"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const proxy = process.env.NEXT_PUBLIC_CORS_PROXY_URL?.trim();
    if (proxy) {
      try {
        const host = new URL(proxy.includes("://") ? proxy : `https://${proxy}`).hostname;
        const link = document.createElement("link");
        link.rel = "dns-prefetch";
        link.href = `//${host}`;
        document.head.appendChild(link);
      } catch {
        /* ignore */
      }
    }

    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  return null;
}
