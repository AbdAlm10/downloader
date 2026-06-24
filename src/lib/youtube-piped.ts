import type { FormatOption } from "./types";
import { ar } from "./ar";
import { abortSignalWithTimeout } from "./client-errors";
import { ITAG_HEIGHT } from "./youtube-innertube-shared";
import { extractYouTubeVideoId, normalizeYoutubeWatchUrl } from "./youtube-url";
import type { parseMediaInfo } from "./formats";

export { extractYouTubeVideoId } from "./youtube-url";

type ParsedMediaInfo = ReturnType<typeof parseMediaInfo>;

interface PipedStream {
  url?: string;
  quality?: string;
  codec?: string;
  container?: string;
  format?: string;
  bitrate?: number;
  videoOnly?: boolean;
  mimeType?: string;
  itag?: number;
  height?: number;
  width?: number;
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

/** Known-good Piped APIs (CORS-enabled, work from browser). */
const PIPED_APIS_HARDCODED = [
  "https://api.piped.private.coffee",
  "https://pipedapi.adminforge.de",
  "https://pipedapi.ducks.party",
  "https://pipedapi.in.projectsegfau.lt",
  "https://pipedapi.leptons.xyz",
  "https://pipedapi.tokhmi.xyz",
] as const;

let cachedApis: string[] | null = null;
let cacheExpiry = 0;

async function discoverPipedApis(): Promise<string[]> {
  if (cachedApis && Date.now() < cacheExpiry) return cachedApis;

  const merged: string[] = [...PIPED_APIS_HARDCODED];

  try {
    const res = await fetch("https://piped-instances.kavin.rocks/", {
      signal: abortSignalWithTimeout(6_000),
    });
    if (res.ok) {
      const rows = (await res.json()) as { api_url?: string }[];
      for (const row of rows) {
        const u = row.api_url?.replace(/\/$/, "");
        if (u?.startsWith("https://") && !merged.includes(u)) {
          merged.push(u);
        }
      }
    }
  } catch {
    /* hardcoded list is enough */
  }

  cachedApis = merged;
  cacheExpiry = Date.now() + 20 * 60 * 1000;
  return merged;
}

function isUsablePipedStream(s: PipedStream): boolean {
  if (!s.url?.startsWith("http")) return false;
  if (s.mimeType?.includes("mpegurl") || s.format === "HLS") return false;
  if (/^LBRY/i.test(s.quality ?? "")) return false;
  if (s.url.includes("odycdn.com")) return false;
  return true;
}

function parseStreamHeight(s: PipedStream): number {
  if (s.height && s.height > 0) return s.height;
  const fromQ = s.quality?.match(/(\d{3,4})p/i);
  if (fromQ) return parseInt(fromQ[1]!, 10);
  if (s.itag && s.itag > 0 && ITAG_HEIGHT[s.itag]) return ITAG_HEIGHT[s.itag]!;
  return 0;
}

function extFromStream(s: PipedStream, fallback: string): string {
  if (s.container) return s.container.replace(/^\./, "") || fallback;
  if (s.format === "MPEG_4" || s.mimeType?.includes("mp4")) return "mp4";
  if (s.mimeType?.includes("webm")) return "webm";
  return fallback;
}

function toPipedMediaInfo(data: PipedResponse, webpageUrl: string, videoId: string): ParsedMediaInfo | null {
  const videoStreams = (data.videoStreams ?? []).filter(isUsablePipedStream);
  const audioStreams = (data.audioStreams ?? []).filter((s) => s.url?.startsWith("http"));

  const videoFormats: FormatOption[] = [];
  for (const s of videoStreams) {
    const h = parseStreamHeight(s);
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

const PIPED_INSTANCE_LIMIT = 8;
const PIPED_REQUEST_MS = 14_000;

async function fetchPipedFromApi(
  api: string,
  videoId: string,
  webpageUrl: string,
  signal?: AbortSignal
): Promise<ParsedMediaInfo | null> {
  const res = await fetch(`${api}/streams/${videoId}`, {
    headers: { Accept: "application/json" },
    signal: signal ?? abortSignalWithTimeout(PIPED_REQUEST_MS),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as PipedResponse;
  if (data.error || data.message) return null;
  return toPipedMediaInfo(data, webpageUrl, videoId);
}

function formatScore(info: ParsedMediaInfo | null): number {
  if (!info) return 0;
  return info.videoFormats.length * 10 + info.audioFormats.length;
}

export async function fetchYoutubeViaPiped(
  url: string,
  signal?: AbortSignal
): Promise<ParsedMediaInfo | null> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return null;

  const watchUrl = normalizeYoutubeWatchUrl(url) ?? url;
  const apis = (await discoverPipedApis()).slice(0, PIPED_INSTANCE_LIMIT);

  const tasks = apis.map(
    (api) =>
      fetchPipedFromApi(api, videoId, watchUrl, signal)
        .then((result) => {
          if (result) return result;
          throw new Error("empty");
        })
        .catch(() => null)
  );

  const settled = await Promise.all(tasks);
  let best: ParsedMediaInfo | null = null;
  let bestScore = 0;

  for (const result of settled) {
    const score = formatScore(result);
    if (score > bestScore) {
      best = result;
      bestScore = score;
    }
  }

  return best;
}

export function isPipedFormatId(formatId: string): boolean {
  return formatId.startsWith("piped-");
}
