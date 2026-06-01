import type { FormatOption } from "./types";
import { ar } from "./ar";
import { formatFileSize } from "./utils";
import type { parseMediaInfo } from "./formats";

type ParsedMediaInfo = ReturnType<typeof parseMediaInfo>;

interface PipedStream {
  url?: string;
  quality?: string;
  codec?: string;
  container?: string;
  bitrate?: number;
  videoOnly?: boolean;
  mimeType?: string;
}

interface PipedResponse {
  error?: string;
  message?: string;
  title?: string;
  description?: string;
  uploadDate?: string;
  uploader?: string;
  uploaderUrl?: string;
  duration?: number;
  thumbnailUrl?: string;
  videoStreams?: PipedStream[];
  audioStreams?: PipedStream[];
}

let cachedApis: string[] | null = null;
let cacheExpiry = 0;

async function discoverPipedApis(): Promise<string[]> {
  if (cachedApis && Date.now() < cacheExpiry) return cachedApis;

  const fallback = ["https://api.piped.private.coffee"];

  try {
    const res = await fetch("https://piped-instances.kavin.rocks/", {
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) {
      const rows = (await res.json()) as { api_url?: string }[];
      const urls = rows
        .map((r) => r.api_url?.replace(/\/$/, ""))
        .filter((u): u is string => Boolean(u?.startsWith("https://")));
      if (urls.length > 0) {
        cachedApis = urls;
        cacheExpiry = Date.now() + 30 * 60 * 1000;
        return urls;
      }
    }
  } catch {
    /* use fallback */
  }

  cachedApis = fallback;
  cacheExpiry = Date.now() + 10 * 60 * 1000;
  return fallback;
}

export function extractYouTubeVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    if (host === "youtu.be") {
      const id = u.pathname.replace(/^\//, "").split("/")[0];
      return id && /^[\w-]{6,}$/.test(id) ? id : null;
    }
    if (host.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return v;
      const shorts = u.pathname.match(/^\/shorts\/([\w-]+)/);
      if (shorts?.[1]) return shorts[1];
    }
  } catch {
    return null;
  }
  return null;
}

function parseHeight(quality?: string): number {
  const m = quality?.match(/(\d{3,4})p/i);
  return m ? parseInt(m[1]!, 10) : 0;
}

function extFromStream(s: PipedStream, fallback: string): string {
  if (s.container) return s.container.replace(/^\./, "") || fallback;
  if (s.mimeType?.includes("webm")) return "webm";
  if (s.mimeType?.includes("mp4")) return "mp4";
  return fallback;
}

function toPipedMediaInfo(data: PipedResponse, webpageUrl: string, videoId: string): ParsedMediaInfo | null {
  const videoStreams = (data.videoStreams ?? []).filter((s) => s.url?.startsWith("http"));
  const audioStreams = (data.audioStreams ?? []).filter((s) => s.url?.startsWith("http"));

  const videoFormats: FormatOption[] = [];
  for (const s of videoStreams) {
    const h = parseHeight(s.quality);
    if (h <= 0) continue;
    const ext = extFromStream(s, "mp4");
    const muxed = !s.videoOnly;
    const id = muxed ? `piped-v-${h}p` : `piped-vo-${h}p`;
    videoFormats.push({
      id,
      label: muxed ? `${h}p · ${ext.toUpperCase()}` : `${h}p · ${ext.toUpperCase()} (${ar.videoOnly})`,
      ext,
      quality: `${h}p`,
      filesizeLabel: "",
      hasVideo: true,
      hasAudio: muxed,
      directUrl: s.url,
    });
  }

  const audioFormats: FormatOption[] = [];
  for (const s of audioStreams) {
    const ext = extFromStream(s, "m4a");
    const br = s.bitrate ? Math.round(s.bitrate / 1000) : 0;
    const id = `piped-a-${br || ext}`;
    audioFormats.push({
      id,
      label: br > 0 ? ar.kbps(br) : ext.toUpperCase(),
      ext,
      quality: br > 0 ? ar.kbps(br) : ar.audioLabel,
      filesizeLabel: "",
      hasVideo: false,
      hasAudio: true,
      directUrl: s.url,
    });
  }

  if (videoFormats.length === 0 && audioFormats.length === 0) return null;

  const dedupeVideo = [...new Map(videoFormats.map((f) => [f.quality, f])).values()].sort(
    (a, b) => parseInt(b.quality) - parseInt(a.quality)
  );

  return {
    id: videoId,
    title: data.title ?? ar.untitled,
    thumbnail: data.thumbnailUrl,
    duration: data.duration,
    uploader: data.uploader,
    platform: "يوتيوب",
    webpageUrl,
    videoFormats: dedupeVideo,
    audioFormats,
    imageFormats: [],
  };
}

const PIPED_INSTANCE_LIMIT = 6;
const PIPED_REQUEST_MS = 10_000;

async function fetchPipedFromApi(
  api: string,
  videoId: string,
  webpageUrl: string
): Promise<ParsedMediaInfo | null> {
  const res = await fetch(`${api}/streams/${videoId}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(PIPED_REQUEST_MS),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as PipedResponse;
  if ("error" in data && data.error) return null;
  return toPipedMediaInfo(data, webpageUrl, videoId);
}

export async function fetchYoutubeViaPiped(url: string): Promise<ParsedMediaInfo | null> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return null;

  const apis = (await discoverPipedApis()).slice(0, PIPED_INSTANCE_LIMIT);
  const settled = await Promise.allSettled(
    apis.map((api) => fetchPipedFromApi(api, videoId, url))
  );

  for (const result of settled) {
    if (result.status === "fulfilled" && result.value) {
      return result.value;
    }
  }

  return null;
}

export function isPipedFormatId(formatId: string): boolean {
  return formatId.startsWith("piped-");
}
