/**
 * Cloudflare Worker — free CORS proxy for TikTok/Instagram page fetches.
 * Deploy: wrangler deploy (or paste into Cloudflare dashboard → Workers).
 * Then set NEXT_PUBLIC_CORS_PROXY_URL=https://YOUR_SUBDOMAIN.workers.dev/proxy?url=
 */
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = url.searchParams.get("url");
    if (!target || !/^https?:\/\//i.test(target)) {
      return new Response("Missing ?url=https://...", { status: 400 });
    }

    const upstream = await fetch(target, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/json,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
      },
      redirect: "follow",
    });

    const headers = new Headers(upstream.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    headers.delete("content-security-policy");

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  },
};
