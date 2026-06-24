/** Netlify Edge — YouTube analyze via InnerTube (single file; Netlify bundles each .ts here as a function). */
const INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const PLAYER_URL = `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}`;

const CLIENTS = [
  {
    clientName: "ANDROID",
    clientVersion: "21.03.36",
    androidSdkVersion: 36,
    hl: "en",
    gl: "US",
  },
  {
    clientName: "IOS",
    clientVersion: "20.11.6",
    deviceModel: "iPhone10,4",
    hl: "en",
    gl: "US",
  },
] as const;

const ITAG_HEIGHT: Record<number, number> = {
  17: 144, 18: 360, 22: 720, 37: 1080, 43: 360, 59: 480, 78: 480,
  82: 360, 83: 480, 84: 720, 85: 1080, 133: 240, 134: 360, 135: 480,
  136: 720, 137: 1080, 298: 720, 299: 1080, 394: 144, 395: 240,
  396: 360, 397: 480, 398: 720, 399: 1080,
};

const MUXED_ITAGS = new Set([18, 22, 37, 59, 78, 82, 83, 84, 85]);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function extractVideoId(url: string): string | null {
  const trimmed = url.trim();
  try {
    const u = new URL(trimmed);
    const host = u.hostname.replace(/^www\.|^m\.|^music\./i, "").toLowerCase();
    if (host === "youtu.be") {
      const id = u.pathname.replace(/^\//, "").split("/")[0];
      return id && /^[\w-]{11}$/.test(id) ? id : null;
    }
    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      const v = u.searchParams.get("v");
      if (v && /^[\w-]{11}$/.test(v)) return v;
      for (const re of [
        /^\/shorts\/([\w-]{11})/,
        /^\/embed\/([\w-]{11})/,
        /^\/live\/([\w-]{11})/,
        /^\/v\/([\w-]{11})/,
      ]) {
        const m = u.pathname.match(re);
        if (m?.[1]) return m[1];
      }
    }
  } catch {
    /* loose */
  }
  const loose = trimmed.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/|v\/))([\w-]{11})/
  );
  return loose?.[1] ?? null;
}

function formatHeight(itag?: number, label?: string): number {
  const m = label?.match(/(\d{3,4})p/i);
  if (m) return parseInt(m[1]!, 10);
  if (itag && ITAG_HEIGHT[itag]) return ITAG_HEIGHT[itag]!;
  return 0;
}

function extFromMime(mime?: string): string {
  if (mime?.includes("webm")) return "webm";
  if (mime?.includes("mp4")) return "mp4";
  if (mime?.includes("opus")) return "opus";
  return "m4a";
}

interface RawFormat {
  itag?: number;
  url?: string;
  mimeType?: string;
  qualityLabel?: string;
  audioQuality?: string;
}

interface RawPlayer {
  playabilityStatus?: { status?: string };
  videoDetails?: {
    title?: string;
    lengthSeconds?: string;
    author?: string;
    thumbnail?: { thumbnails?: { url?: string }[] };
  };
  streamingData?: { formats?: RawFormat[]; adaptiveFormats?: RawFormat[] };
}

interface EdgeFormat {
  id: string;
  label: string;
  ext: string;
  quality: string;
  filesizeLabel: string;
  hasVideo: boolean;
  hasAudio: boolean;
  directUrl?: string;
}

interface EdgeMediaInfo {
  id: string;
  title: string;
  thumbnail?: string;
  duration?: number;
  durationLabel: string;
  uploader?: string;
  platform: string;
  webpageUrl: string;
  videoFormats: EdgeFormat[];
  audioFormats: EdgeFormat[];
  imageFormats: EdgeFormat[];
  analyzedOnDevice: boolean;
}

async function postPlayer(
  videoId: string,
  client: (typeof CLIENTS)[number]
): Promise<RawPlayer | null> {
  const res = await fetch(PLAYER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://www.youtube.com",
      Referer: `https://www.youtube.com/watch?v=${videoId}`,
      "User-Agent": "com.google.android.youtube/21.03.36 (Linux; U; Android 16) gzip",
    },
    body: JSON.stringify({ videoId, context: { client } }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as RawPlayer;
  if (data.playabilityStatus?.status !== "OK" || !data.streamingData) return null;
  return data;
}

function mapPlayerToMediaInfo(
  data: RawPlayer,
  videoId: string,
  webpageUrl: string
): EdgeMediaInfo | null {
  const vd = data.videoDetails;
  const all = [
    ...(data.streamingData?.formats ?? []),
    ...(data.streamingData?.adaptiveFormats ?? []),
  ];
  if (!vd || all.length === 0) return null;

  const heights = new Set<number>();
  const byHeight = new Map<number, { muxed?: RawFormat; any?: RawFormat }>();

  for (const f of all) {
    const mime = f.mimeType ?? "";
    const isVideo = mime.includes("video") || /\d+p/i.test(f.qualityLabel ?? "");
    if (!isVideo) continue;
    const h = formatHeight(f.itag, f.qualityLabel);
    if (h <= 0) continue;
    heights.add(h);
    const slot = byHeight.get(h) ?? {};
    const muxed = Boolean(f.audioQuality) || (f.itag !== undefined && MUXED_ITAGS.has(f.itag));
    if (muxed && f.url?.startsWith("http")) slot.muxed = f;
    if (!slot.any) slot.any = f;
    byHeight.set(h, slot);
  }

  const videoFormats: EdgeFormat[] = [];
  for (const h of [...heights].sort((a, b) => b - a)) {
    const pick = byHeight.get(h)?.muxed ?? byHeight.get(h)?.any;
    if (!pick) continue;
    const ext = extFromMime(pick.mimeType);
    const muxed = pick.itag !== undefined && MUXED_ITAGS.has(pick.itag);
    const directUrl = pick.url?.startsWith("http") ? pick.url : undefined;
    videoFormats.push({
      id: directUrl && pick.itag ? `inn-${pick.itag}` : `inn-q-${h}p`,
      label: muxed ? `${h}p` : `${h}p (فيديو فقط)`,
      ext,
      quality: `${h}p`,
      filesizeLabel: "",
      hasVideo: true,
      hasAudio: muxed,
      directUrl,
    });
  }

  const audioFormats: EdgeFormat[] = [];
  const seen = new Set<string>();
  for (const f of all) {
    const mime = f.mimeType ?? "";
    if (!mime.includes("audio") && !f.audioQuality) continue;
    if (mime.includes("video") && !f.audioQuality) continue;
    const ext = extFromMime(mime);
    const id = `inn-a-${f.itag ?? ext}`;
    if (seen.has(id)) continue;
    seen.add(id);
    audioFormats.push({
      id,
      label: "صوت",
      ext,
      quality: "صوت",
      filesizeLabel: "",
      hasVideo: false,
      hasAudio: true,
      directUrl: f.url?.startsWith("http") ? f.url : undefined,
    });
  }

  if (audioFormats.length === 0 && videoFormats.length > 0) {
    audioFormats.push({
      id: "inn-q-audio",
      label: "صوت",
      ext: "m4a",
      quality: "أفضل جودة",
      filesizeLabel: "",
      hasVideo: false,
      hasAudio: true,
    });
  }

  if (videoFormats.length === 0 && audioFormats.length === 0) return null;

  const thumbs = vd.thumbnail?.thumbnails ?? [];
  const duration = vd.lengthSeconds ? parseInt(vd.lengthSeconds, 10) : undefined;

  return {
    id: videoId,
    title: vd.title ?? "بدون عنوان",
    thumbnail: thumbs[thumbs.length - 1]?.url,
    duration,
    durationLabel: duration
      ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}`
      : "—",
    uploader: vd.author,
    platform: "يوتيوب",
    webpageUrl,
    videoFormats,
    audioFormats,
    imageFormats: [],
    analyzedOnDevice: false,
  };
}

async function fetchYoutubeOnEdge(url: string): Promise<EdgeMediaInfo | null> {
  const videoId = extractVideoId(url);
  if (!videoId) return null;
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;

  for (const client of CLIENTS) {
    try {
      const data = await postPlayer(videoId, client);
      if (!data) continue;
      const mapped = mapPlayerToMediaInfo(data, videoId, watchUrl);
      if (mapped) return mapped;
    } catch {
      continue;
    }
  }
  return null;
}

export default async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS });
  }

  try {
    const body = (await request.json()) as { url?: string };
    const url = body.url?.trim();
    if (!url) {
      return Response.json(
        { success: false, error: "رابط غير صالح" },
        { status: 400, headers: CORS }
      );
    }

    const data = await fetchYoutubeOnEdge(url);
    if (!data) {
      return Response.json(
        {
          success: false,
          error: "تعذّر تحليل يوتيوب. جرّب رابطاً آخر أو انتظر قليلاً ثم أعد التحليل.",
        },
        { status: 422, headers: CORS }
      );
    }

    return Response.json({ success: true, data }, { headers: CORS });
  } catch {
    return Response.json(
      { success: false, error: "تعذّر جلب معلومات الوسائط" },
      { status: 500, headers: CORS }
    );
  }
};

export const config = { path: "/api/youtube/info" };
