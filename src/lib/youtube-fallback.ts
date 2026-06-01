import type { MediaInfo } from "./types";
import { formatFileSize } from "./utils";
import { ar } from "./ar";

/** Fallback Invidious API bases (also merged with live instance list when reachable). */
const INVIDIOUS_INSTANCES = [
  "https://invidious.f5.si",
  "https://invidious.private.coffee",
  "https://inv.nadeko.net",
  "https://yewtu.be",
] as const;

let cachedInstances: string[] | null = null;
let cacheExpiry = 0;

async function discoverInvidiousInstances(): Promise<string[]> {
  if (cachedInstances && Date.now() < cacheExpiry) return cachedInstances;

  try {
    const res = await fetch("https://api.invidious.io/instances.json?sort_by=health", {
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) {
      const rows = (await res.json()) as [string, unknown][];
      const urls = rows
        .map(([uri]) => uri)
        .filter((uri) => uri.startsWith("https://"))
        .slice(0, 8);
      if (urls.length > 0) {
        cachedInstances = urls;
        cacheExpiry = Date.now() + 60 * 60 * 1000;
        return urls;
      }
    }
  } catch {
    /* use static list */
  }

  cachedInstances = [...INVIDIOUS_INSTANCES];
  cacheExpiry = Date.now() + 15 * 60 * 1000;
  return cachedInstances;
}

interface InvidiousFormat {
  itag?: string;
  quality?: string;
  type?: string;
  container?: string;
  url?: string;
  size?: number;
  resolution?: string;
  fps?: number;
}

interface InvidiousVideo {
  title?: string;
  videoId?: string;
  videoThumbnails?: { url?: string; width?: number; height?: number }[];
  lengthSeconds?: number;
  author?: string;
  formatStreams?: InvidiousFormat[];
  adaptiveFormats?: InvidiousFormat[];
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
      const embed = u.pathname.match(/^\/embed\/([\w-]+)/);
      if (embed?.[1]) return embed[1];
    }
  } catch {
    return null;
  }
  return null;
}

function parseHeight(quality?: string, resolution?: string): number {
  const fromQ = quality?.match(/(\d{3,4})p/i);
  if (fromQ) return parseInt(fromQ[1]!, 10);
  const fromR = resolution?.match(/x(\d{3,4})/i) ?? resolution?.match(/(\d{3,4})p/i);
  if (fromR) return parseInt(fromR[1]!, 10);
  return 0;
}

function invidiousToMediaInfo(video: InvidiousVideo, webpageUrl: string): MediaInfo | null {
  const streams = [...(video.formatStreams ?? []), ...(video.adaptiveFormats ?? [])].filter(
    (f) => f.url && /^https?:/i.test(f.url)
  );

  if (streams.length === 0) return null;

  const thumb =
    video.videoThumbnails
      ?.filter((t) => t.url)
      .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ?? undefined;

  const videoFormats = streams
    .filter((f) => (f.type ?? "").includes("video") && parseHeight(f.quality, f.resolution) > 0)
    .map((f) => {
      const h = parseHeight(f.quality, f.resolution);
      const ext = (f.container ?? "mp4").replace(/^\./, "") || "mp4";
      const id = `inv-${f.itag ?? h}`;
      return {
        id,
        label: `${h}p · ${ext}`,
        ext,
        quality: `${h}p`,
        filesize: f.size,
        filesizeLabel: formatFileSize(f.size),
        hasVideo: true,
        hasAudio: true,
        fps: f.fps,
        directUrl: f.url,
      };
    });

  const audioFormats = streams
    .filter((f) => (f.type ?? "").includes("audio"))
    .map((f) => {
      const ext = (f.container ?? "m4a").replace(/^\./, "") || "m4a";
      const id = `inv-a-${f.itag ?? ext}`;
      return {
        id,
        label: `صوت · ${ext}`,
        ext,
        quality: f.quality ?? ar.audioLabel,
        filesize: f.size,
        filesizeLabel: formatFileSize(f.size),
        hasVideo: false,
        hasAudio: true,
        directUrl: f.url,
      };
    });

  const dedupeVideo = [...new Map(videoFormats.map((f) => [f.quality, f])).values()].sort(
    (a, b) => parseInt(b.quality) - parseInt(a.quality)
  );
  const dedupeAudio = [...new Map(audioFormats.map((f) => [f.ext, f])).values()];

  if (dedupeVideo.length === 0 && dedupeAudio.length === 0) return null;

  return {
    id: video.videoId ?? "youtube",
    title: video.title ?? ar.untitled,
    thumbnail: thumb,
    duration: video.lengthSeconds,
    durationLabel: "",
    uploader: video.author,
    platform: "يوتيوب",
    webpageUrl,
    videoFormats: dedupeVideo,
    audioFormats: dedupeAudio,
    imageFormats: [],
  };
}

/** Secondary path when yt-dlp cannot solve YouTube JS challenges on the host. */
export async function fetchYouTubeViaInvidious(url: string): Promise<MediaInfo | null> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return null;

  const bases = await discoverInvidiousInstances();

  for (const base of bases) {
    try {
      const res = await fetch(`${base}/api/v1/videos/${videoId}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as InvidiousVideo;
      const info = invidiousToMediaInfo(data, url);
      if (info) return info;
    } catch {
      continue;
    }
  }

  return null;
}
