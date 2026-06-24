import type { MediaInfo } from "./types";

interface EdgeInfoResponse {
  success: boolean;
  data?: MediaInfo;
  error?: string;
}

function edgeInfoUrl(): string {
  const custom = process.env.NEXT_PUBLIC_YOUTUBE_EDGE_URL?.trim();
  if (custom) return custom;
  return "/api/youtube/info";
}

/** Same-origin Netlify Edge (or custom URL) — bypasses browser YouTube blocks. */
export async function fetchYoutubeViaEdge(url: string, signal?: AbortSignal): Promise<MediaInfo | null> {
  try {
    const res = await fetch(edgeInfoUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal,
      cache: "no-store",
    });

    const data = (await res.json()) as EdgeInfoResponse;
    if (!res.ok || !data.success || !data.data) return null;
    return data.data;
  } catch {
    return null;
  }
}
