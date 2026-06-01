import type { FormatOption } from "./types";
import { ar } from "./ar";
import { isDirectImageUrl } from "./image-url";
import { formatFileSize } from "./utils";

interface RawFormat {
  format_id?: string;
  ext?: string;
  format_note?: string;
  resolution?: string;
  height?: number;
  width?: number;
  fps?: number;
  vcodec?: string;
  acodec?: string;
  filesize?: number;
  filesize_approx?: number;
  tbr?: number;
  abr?: number;
  vbr?: number;
  protocol?: string;
  url?: string;
}

interface RawThumbnail {
  url?: string;
  width?: number;
  height?: number;
  id?: string;
  resolution?: string;
}

interface RawInfo {
  id?: string;
  title?: string;
  thumbnail?: string;
  duration?: number;
  uploader?: string;
  channel?: string;
  extractor?: string;
  extractor_key?: string;
  webpage_url?: string;
  original_url?: string;
  formats?: RawFormat[];
  thumbnails?: RawThumbnail[];
  _type?: string;
}

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif"]);

function isImageExt(ext?: string): boolean {
  return IMAGE_EXTS.has((ext ?? "").toLowerCase());
}

function extFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname.toLowerCase();
    const match = path.match(/\.(jpe?g|png|webp|gif|avif|bmp)(?:\?|$)/);
    return match?.[1]?.replace("jpeg", "jpg") ?? "jpg";
  } catch {
    return "jpg";
  }
}

function isStreamableFormat(f: RawFormat): boolean {
  if (!f.format_id || f.format_id === "sb") return false;
  const vcodec = f.vcodec ?? "none";
  const acodec = f.acodec ?? "none";
  if (vcodec === "none" && acodec === "none" && !isImageExt(f.ext)) return false;
  if (f.protocol && /m3u8|dash|manifest|fmp4/i.test(f.protocol)) return false;
  return true;
}

function qualityLabel(f: RawFormat, type: "video" | "audio" | "image"): string {
  if (type === "image") {
    if (f.width && f.height) return `${f.width}×${f.height}`;
    if (f.width) return ar.widthPx(f.width);
    if (f.height) return ar.heightPx(f.height);
    return f.format_note || ar.imageLabel;
  }
  if (type === "video") {
    if (f.height) return `${f.height}p`;
    if (f.resolution && f.resolution !== "audio only") return f.resolution;
    return f.format_note || ar.videoLabel;
  }
  const kbps = f.abr ?? f.tbr;
  if (kbps) return ar.kbps(Math.round(kbps));
  return f.format_note || ar.audioLabel;
}

function formatKey(f: RawFormat, type: "video" | "audio" | "image"): string {
  if (type === "image") return `${f.width ?? 0}x${f.height ?? 0}-${f.ext}`;
  if (type === "video") return `${f.height ?? 0}-${f.ext}-${f.vcodec}-${f.acodec}`;
  return `${f.abr ?? f.tbr ?? 0}-${f.ext}-${f.acodec}`;
}

function toOption(
  f: RawFormat,
  type: "video" | "audio" | "image",
  directUrl?: string
): FormatOption {
  const size = f.filesize ?? f.filesize_approx;
  const quality = qualityLabel(f, type);
  const ext = isImageExt(f.ext) ? (f.ext ?? "jpg") : (f.ext ?? type === "audio" ? "mp3" : "mp4");
  const note = f.format_note ? ` · ${f.format_note}` : "";

  return {
    id: f.format_id!,
    label: `${quality}${note}`,
    ext,
    quality,
    filesize: size,
    filesizeLabel: formatFileSize(size),
    hasVideo: type === "video" || type === "image",
    hasAudio: type === "audio",
    fps: f.fps,
    vcodec: f.vcodec,
    acodec: f.acodec,
    directUrl,
  };
}

function thumbnailToFormat(t: RawThumbnail, index: number): FormatOption | null {
  if (!t.url || !isDirectImageUrl(t.url)) return null;
  const w = t.width ?? 0;
  const h = t.height ?? 0;
  const ext = extFromUrl(t.url);
  const id = `img-${w}x${h}-${index}`;

  return {
    id,
    label: w && h ? `${w}×${h}` : w ? `${w}px` : ar.imageN(index + 1),
    ext,
    quality: w ? `${w}px` : ar.original,
    filesizeLabel: "",
    hasVideo: false,
    hasAudio: false,
    directUrl: t.url,
  };
}

function pickBest(formats: FormatOption[]): FormatOption[] {
  const seen = new Map<string, FormatOption>();
  for (const f of formats) {
    const key = `${f.quality}-${f.ext}`;
    const existing = seen.get(key);
    if (!existing || (f.filesize ?? 0) > (existing.filesize ?? 0)) {
      seen.set(key, f);
    }
  }
  return Array.from(seen.values());
}

function parseImageFormats(raw: RawInfo, formats: RawFormat[]): FormatOption[] {
  const fromThumbs: FormatOption[] = [];
  const thumbList = raw.thumbnails ?? [];

  for (let i = 0; i < thumbList.length; i++) {
    const opt = thumbnailToFormat(thumbList[i]!, i);
    if (opt) fromThumbs.push(opt);
  }

  if (raw.thumbnail) {
    const exists = fromThumbs.some((t) => t.directUrl === raw.thumbnail);
    if (!exists) {
      const opt = thumbnailToFormat({ url: raw.thumbnail, width: 0, height: 0 }, thumbList.length);
      if (opt) fromThumbs.push({ ...opt, label: ar.coverImage, quality: ar.coverImage });
    }
  }

  const fromFormats = formats
    .filter(
      (f) =>
        !!f.url &&
        isDirectImageUrl(f.url) &&
        (isImageExt(f.ext) ||
          ((f.vcodec ?? "none") === "none" &&
            (f.acodec ?? "none") === "none" &&
            (f.width ?? 0) > 0))
    )
    .map((f) => toOption({ ...f, format_id: f.format_id ?? `fmt-${f.width}` }, "image", f.url));

  const merged = [...fromFormats, ...fromThumbs];
  const byWidth = new Map<number, FormatOption>();
  for (const img of merged) {
    const w = parseInt(img.quality) || parseInt(img.id.match(/img-(\d+)/)?.[1] ?? "0") || 0;
    const key = img.directUrl ?? img.id;
    const prev = [...byWidth.values()].find((x) => (x.directUrl ?? x.id) === key);
    if (!prev || w >= (parseInt(prev.quality) || 0)) {
      byWidth.set(w, img);
    }
  }

  return pickBest(
    Array.from(byWidth.values()).sort((a, b) => {
      const aw = parseInt(a.quality) || 0;
      const bw = parseInt(b.quality) || 0;
      return bw - aw;
    })
  );
}

export function parseMediaInfo(raw: RawInfo, url: string): {
  id: string;
  title: string;
  thumbnail?: string;
  duration?: number;
  uploader?: string;
  platform: string;
  webpageUrl: string;
  videoFormats: FormatOption[];
  audioFormats: FormatOption[];
  imageFormats: FormatOption[];
} {
  const formats = (raw.formats ?? []).filter(isStreamableFormat);

  const videoRaw = formats.filter(
    (f) => (f.vcodec ?? "none") !== "none" && (f.height ?? 0) > 0 && !isImageExt(f.ext)
  );
  const audioOnlyRaw = formats.filter(
    (f) =>
      (f.vcodec ?? "none") === "none" &&
      (f.acodec ?? "none") !== "none" &&
      !isImageExt(f.ext)
  );
  const combinedRaw = formats.filter(
    (f) =>
      (f.vcodec ?? "none") !== "none" &&
      (f.acodec ?? "none") !== "none" &&
      (f.height ?? 0) > 0 &&
      !isImageExt(f.ext)
  );

  const videoCandidates = [...combinedRaw, ...videoRaw]
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))
    .filter(
      (f, i, arr) =>
        arr.findIndex((x) => formatKey(x, "video") === formatKey(f, "video")) === i
    );

  const audioCandidates = audioOnlyRaw
    .sort((a, b) => (b.abr ?? b.tbr ?? 0) - (a.abr ?? a.tbr ?? 0))
    .filter(
      (f, i, arr) =>
        arr.findIndex((x) => formatKey(x, "audio") === formatKey(f, "audio")) === i
    );

  const videoFormats = pickBest(videoCandidates.map((f) => toOption(f, "video")));
  const audioFormats = pickBest(audioCandidates.map((f) => toOption(f, "audio")));
  const imageFormats = parseImageFormats(raw, formats);

  const platform =
    raw.extractor_key ?? raw.extractor ?? detectPlatform(url) ?? "Unknown";

  const thumbnail =
    (raw.thumbnail && isDirectImageUrl(raw.thumbnail) ? raw.thumbnail : undefined) ??
    imageFormats.find((f) => f.directUrl && isDirectImageUrl(f.directUrl))?.directUrl;

  return {
    id: raw.id ?? "media",
    title: raw.title ?? ar.untitled,
    thumbnail,
    duration: raw.duration,
    uploader: raw.uploader ?? raw.channel,
    platform: formatPlatformName(platform),
    webpageUrl: raw.webpage_url ?? raw.original_url ?? url,
    videoFormats,
    audioFormats,
    imageFormats,
  };
}

function detectPlatform(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const map: Record<string, string> = {
      "youtube.com": "يوتيوب",
      "youtu.be": "يوتيوب",
      "tiktok.com": "تيك توك",
      "instagram.com": "إنستغرام",
      "twitter.com": "تويتر",
      "x.com": "إكس",
      "facebook.com": "فيسبوك",
      "fb.watch": "فيسبوك",
      "vimeo.com": "فيميو",
      "reddit.com": "ريديت",
      "twitch.tv": "تويش",
      "soundcloud.com": "ساوند كلاود",
      "dailymotion.com": "ديلي موشن",
      "pinterest.com": "بينتريست",
      "linkedin.com": "لينكدإن",
      "bilibili.com": "بيليبيلي",
    };
    for (const [domain, name] of Object.entries(map)) {
      if (host.includes(domain)) return name;
    }
    return host.split(".")[0] ?? "وسائط";
  } catch {
    return "وسائط";
  }
}

function formatPlatformName(key: string): string {
  return key
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export type { RawInfo };
