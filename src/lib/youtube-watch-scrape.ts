import {
  mapInnertubeStreamingToInfo,
  type InnertubeStreamFormat,
  type MappedYoutubeInfo,
} from "./youtube-innertube-shared";
import { fetchTextViaProxyChain } from "./public-cors-proxies";

interface RawPlayerFormat {
  itag?: number;
  url?: string;
  mimeType?: string;
  qualityLabel?: string;
  audioQuality?: string;
}

interface RawPlayerResponse {
  playabilityStatus?: { status?: string; reason?: string };
  videoDetails?: {
    title?: string;
    lengthSeconds?: string;
    author?: string;
    thumbnail?: { thumbnails?: { url?: string }[] };
  };
  streamingData?: {
    formats?: RawPlayerFormat[];
    adaptiveFormats?: RawPlayerFormat[];
  };
}

function normalizeFormat(f: RawPlayerFormat): InnertubeStreamFormat {
  const mime = f.mimeType ?? "";
  return {
    itag: f.itag,
    quality_label: f.qualityLabel,
    mime_type: mime,
    has_audio: Boolean(f.audioQuality) || mime.includes("audio"),
    has_video: mime.includes("video") || /\d+p/i.test(f.qualityLabel ?? ""),
    url: f.url,
  };
}

export function extractPlayerResponseFromHtml(html: string): RawPlayerResponse | null {
  const markers = ["var ytInitialPlayerResponse = ", "ytInitialPlayerResponse = "];
  for (const marker of markers) {
    const idx = html.indexOf(marker);
    if (idx < 0) continue;
    const parsed = extractBalancedJson(html, html.indexOf("{", idx));
    if (parsed) return parsed;
  }
  return null;
}

function extractBalancedJson(html: string, start: number): RawPlayerResponse | null {
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1)) as RawPlayerResponse;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function mapRawPlayerResponse(
  data: RawPlayerResponse,
  webpageUrl: string,
  videoId: string
): MappedYoutubeInfo | null {
  const vd = data.videoDetails;
  const sd = data.streamingData;
  if (!vd || !sd) return null;

  const streaming = {
    formats: (sd.formats ?? []).map(normalizeFormat),
    adaptive_formats: (sd.adaptiveFormats ?? []).map(normalizeFormat),
  };

  const thumbs = vd.thumbnail?.thumbnails ?? [];

  return mapInnertubeStreamingToInfo(
    {
      title: vd.title,
      duration: vd.lengthSeconds ? parseInt(vd.lengthSeconds, 10) : undefined,
      author: vd.author,
      thumbnail: thumbs.length ? [{ url: thumbs[thumbs.length - 1]?.url }] : undefined,
    },
    streaming,
    webpageUrl,
    videoId
  );
}

/** Fetch watch page HTML (direct, then CORS proxy) and parse embedded player JSON. */
export async function fetchYoutubeFromWatchPage(
  videoId: string,
  webpageUrl: string,
  signal?: AbortSignal
): Promise<MappedYoutubeInfo | null> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}&bpctr=9999999999`;

  const tryParse = (html: string): MappedYoutubeInfo | null => {
    const raw = extractPlayerResponseFromHtml(html);
    if (!raw || raw.playabilityStatus?.status === "ERROR") return null;
    return mapRawPlayerResponse(raw, webpageUrl, videoId);
  };

  try {
    const direct = await fetch(watchUrl, {
      signal,
      credentials: "omit",
      headers: {
        Accept: "text/html",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (direct.ok) {
      const html = await direct.text();
      const mapped = tryParse(html);
      if (mapped && (mapped.videoFormats.length > 0 || mapped.audioFormats.length > 0)) {
        return mapped;
      }
    }
  } catch {
    /* CORS — try proxy */
  }

  try {
    const html = await fetchTextViaProxyChain(watchUrl, signal);
    const mapped = tryParse(html);
    if (mapped && (mapped.videoFormats.length > 0 || mapped.audioFormats.length > 0)) {
      return mapped;
    }
  } catch {
    return null;
  }

  return null;
}
