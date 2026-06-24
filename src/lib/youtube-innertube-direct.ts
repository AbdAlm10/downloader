import { ar } from "./ar";
import {
  mapInnertubeStreamingToInfo,
  type InnertubeStreamFormat,
  type MappedYoutubeInfo,
} from "./youtube-innertube-shared";

/** Public InnerTube key used by YouTube's web/Android clients */
const INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const PLAYER_URL = `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}`;

type DirectClient = "ANDROID" | "IOS" | "TV_EMBEDDED" | "WEB";

const CLIENT_BODIES: Record<DirectClient, Record<string, unknown>> = {
  ANDROID: {
    clientName: "ANDROID",
    clientVersion: "19.45.36",
    androidSdkVersion: 30,
    hl: "en",
    gl: "US",
  },
  IOS: {
    clientName: "IOS",
    clientVersion: "19.45.4",
    deviceModel: "iPhone14,3",
    hl: "en",
    gl: "US",
  },
  TV_EMBEDDED: {
    clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
    clientVersion: "2.0",
    hl: "en",
    gl: "US",
  },
  WEB: {
    clientName: "WEB",
    clientVersion: "2.20241126.01.00",
    hl: "en",
    gl: "US",
  },
};

const CLIENT_ORDER: DirectClient[] = ["ANDROID", "IOS", "TV_EMBEDDED", "WEB"];

interface RawPlayerFormat {
  itag?: number;
  url?: string;
  mimeType?: string;
  qualityLabel?: string;
  audioQuality?: string;
  signatureCipher?: string;
  cipher?: string;
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

function parsePlayerJson(
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

async function postPlayer(
  videoId: string,
  client: DirectClient,
  signal?: AbortSignal
): Promise<RawPlayerResponse | null> {
  const body = JSON.stringify({
    videoId,
    context: { client: CLIENT_BODIES[client] },
  });
  const headers = {
    "Content-Type": "application/json",
    Origin: "https://www.youtube.com",
    Referer: `https://www.youtube.com/watch?v=${videoId}`,
  };

  const res = await fetch(PLAYER_URL, {
    method: "POST",
    signal: signal ?? AbortSignal.timeout(18_000),
    credentials: "omit",
    headers,
    body,
  });
  if (!res.ok) return null;

  const data = (await res.json()) as RawPlayerResponse;
  if (data.playabilityStatus?.status !== "OK") return null;
  if (!data.streamingData) return null;
  return data;
}

/** Lightweight InnerTube player call — no youtubei.js init (works when the library fails to load). */
export async function fetchYoutubePlayerDirect(
  videoId: string,
  webpageUrl: string,
  signal?: AbortSignal
): Promise<MappedYoutubeInfo | null> {
  for (const client of CLIENT_ORDER) {
    try {
      const data = await postPlayer(videoId, client, signal);
      if (!data) continue;
      const mapped = parsePlayerJson(data, webpageUrl, videoId);
      if (
        mapped &&
        (mapped.videoFormats.length > 0 || mapped.audioFormats.length > 0)
      ) {
        return mapped;
      }
    } catch {
      continue;
    }
  }
  return null;
}

/** Resolve a playable googlevideo URL for a format id (inn-18, inn-q-720p, …). */
export async function resolveYoutubeStreamUrl(
  videoId: string,
  formatId: string,
  signal?: AbortSignal
): Promise<string | null> {
  const webpageUrl = `https://www.youtube.com/watch?v=${videoId}`;

  for (const client of CLIENT_ORDER) {
    try {
      const data = await postPlayer(videoId, client, signal);
      if (!data?.streamingData) continue;

      const all = [...(data.streamingData.formats ?? []), ...(data.streamingData.adaptiveFormats ?? [])];

      const itagMatch = formatId.match(/^inn-(\d+)$/);
      if (itagMatch) {
        const itag = parseInt(itagMatch[1]!, 10);
        const hit = all.find((f) => f.itag === itag && f.url?.startsWith("http"));
        if (hit?.url) return hit.url;
      }

      const heightMatch = formatId.match(/(\d{3,4})p/);
      if (heightMatch) {
        const h = parseInt(heightMatch[1]!, 10);
        const byHeight = all
          .filter((f) => f.url?.startsWith("http"))
          .map((f) => ({
            f,
            qh: parseInt(f.qualityLabel?.match(/(\d{3,4})/)?.[1] ?? "0", 10),
          }))
          .filter((x) => x.qh > 0)
          .sort((a, b) => Math.abs(a.qh - h) - Math.abs(b.qh - h));
        if (byHeight[0]?.f.url) return byHeight[0].f.url;

        const hit = all.find(
          (f) =>
            f.url?.startsWith("http") &&
            (f.qualityLabel === `${h}p` || f.qualityLabel === `${h}p60`)
        );
        if (hit?.url) return hit.url;
      }

      const mapped = parsePlayerJson(data, webpageUrl, videoId);
      const pick =
        mapped?.videoFormats.find((f) => f.id === formatId) ??
        mapped?.audioFormats.find((f) => f.id === formatId);
      if (pick?.directUrl) return pick.directUrl;

      if (formatId.startsWith("inn-a-") || formatId === "inn-q-audio") {
        const audioHit = all.find(
          (f) => f.url?.startsWith("http") && f.mimeType?.includes("audio")
        );
        if (audioHit?.url) return audioHit.url;
      }
    } catch {
      continue;
    }
  }

  return null;
}

export async function downloadGoogleVideoStream(
  streamUrl: string,
  options: {
    signal?: AbortSignal;
    onProgress?: (loaded: number) => void;
  } = {}
): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(streamUrl, {
      signal: options.signal,
      credentials: "omit",
      mode: "cors",
      headers: {
        Accept: "*/*",
        Origin: "https://www.youtube.com",
        Referer: "https://www.youtube.com/",
      },
    });
  } catch {
    throw new Error(ar.downloadFailed);
  }

  if (!res.ok) {
    throw new Error(ar.downloadFailed);
  }

  if (!res.body) {
    return res.blob();
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  while (true) {
    if (options.signal?.aborted) {
      await reader.cancel();
      throw new DOMException("Aborted", "AbortError");
    }
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.byteLength;
      options.onProgress?.(loaded);
    }
  }

  return new Blob(chunks as BlobPart[], { type: "video/mp4" });
}
