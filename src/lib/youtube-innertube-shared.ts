import type { FormatOption } from "./types";
import { ar } from "./ar";

import { YOUTUBE_INNERTUBE_CLIENT_ORDER } from "./youtube-clients";

export const INNERTUBE_CLIENTS = [
  ...YOUTUBE_INNERTUBE_CLIENT_ORDER,
  "MWEB",
  "WEB_EMBEDDED",
] as const;

export type InnertubeClient = (typeof INNERTUBE_CLIENTS)[number];

export type InnertubeStreamFormat = {
  itag?: number;
  quality_label?: string;
  mime_type?: string;
  has_audio?: boolean;
  has_video?: boolean;
  url?: string;
  audio_quality?: string;
};

/** Progressive / common itags when quality_label is missing */
export const ITAG_HEIGHT: Record<number, number> = {
  17: 144,
  18: 360,
  22: 720,
  37: 1080,
  43: 360,
  59: 480,
  78: 480,
  82: 360,
  83: 480,
  84: 720,
  85: 1080,
  133: 240,
  134: 360,
  135: 480,
  136: 720,
  137: 1080,
  298: 720,
  299: 1080,
  394: 144,
  395: 240,
  396: 360,
  397: 480,
  398: 720,
  399: 1080,
};

const MUXED_ITAGS = new Set([18, 22, 37, 59, 78, 82, 83, 84, 85]);

export function formatHeightFromLabel(label?: string): number {
  const m = label?.match(/(\d{3,4})p/i);
  return m ? parseInt(m[1]!, 10) : 0;
}

export function formatHeight(itag?: number, label?: string): number {
  const fromLabel = formatHeightFromLabel(label);
  if (fromLabel > 0) return fromLabel;
  if (itag && ITAG_HEIGHT[itag]) return ITAG_HEIGHT[itag]!;
  return 0;
}

export function isVideoFormat(f: InnertubeStreamFormat): boolean {
  if (f.has_video === false) return false;
  if (f.has_video === true) return true;
  if (f.mime_type?.includes("video")) return true;
  if (f.itag && ITAG_HEIGHT[f.itag]) return true;
  return false;
}

export function isAudioOnlyFormat(f: InnertubeStreamFormat): boolean {
  if (f.has_video === true) return false;
  if (f.mime_type?.includes("audio")) return true;
  return f.has_audio === true;
}

function extFromMime(mime?: string): string {
  if (mime?.includes("webm")) return "webm";
  if (mime?.includes("mp4")) return "mp4";
  if (mime?.includes("opus")) return "opus";
  return "m4a";
}

function hasMuxedAudio(f: InnertubeStreamFormat): boolean {
  return f.has_audio === true || (f.itag !== undefined && MUXED_ITAGS.has(f.itag));
}

export interface InnertubeBasicInfo {
  title?: string;
  duration?: number;
  author?: string;
  thumbnail?: { url?: string }[];
}

export interface MappedYoutubeInfo {
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
}

export function mapInnertubeStreamingToInfo(
  basic: InnertubeBasicInfo,
  streaming: {
    formats?: InnertubeStreamFormat[];
    adaptive_formats?: InnertubeStreamFormat[];
  } | null,
  webpageUrl: string,
  videoId: string
): MappedYoutubeInfo | null {
  const all = [...(streaming?.formats ?? []), ...(streaming?.adaptive_formats ?? [])];
  if (all.length === 0) return null;

  const heightsAvailable = new Set<number>();
  for (const f of all) {
    if (!isVideoFormat(f)) continue;
    const h = formatHeight(f.itag, f.quality_label);
    if (h > 0) heightsAvailable.add(h);
  }

  const byHeight = new Map<
    number,
    { muxed?: InnertubeStreamFormat; any?: InnertubeStreamFormat }
  >();

  for (const f of all) {
    if (!isVideoFormat(f)) continue;
    const h = formatHeight(f.itag, f.quality_label);
    if (h <= 0) continue;
    const slot = byHeight.get(h) ?? {};
    if (hasMuxedAudio(f) && f.url?.startsWith("http")) slot.muxed = f;
    if (!slot.any) slot.any = f;
    byHeight.set(h, slot);
  }

  const videoFormats: FormatOption[] = [];

  for (const h of [...heightsAvailable].sort((a, b) => b - a)) {
    const slot = byHeight.get(h);
    const pick = slot?.muxed ?? slot?.any;
    const ext = extFromMime(pick?.mime_type);
    const muxed = pick ? hasMuxedAudio(pick) : false;
    const directUrl = pick?.url?.startsWith("http") ? pick.url : undefined;
    const itag = pick?.itag;

    videoFormats.push({
      id: directUrl && itag ? `inn-${itag}` : `inn-q-${h}p`,
      label: muxed ? `${h}p` : `${h}p (${ar.videoOnly})`,
      ext,
      quality: `${h}p`,
      filesizeLabel: "",
      hasVideo: true,
      hasAudio: muxed,
      directUrl,
    });
  }

  const audioFormats: FormatOption[] = [];
  const seenAudio = new Set<string>();

  for (const f of all) {
    if (!isAudioOnlyFormat(f)) continue;
    const ext = extFromMime(f.mime_type);
    const id = `inn-a-${f.itag ?? ext}`;
    if (seenAudio.has(id)) continue;
    seenAudio.add(id);
    audioFormats.push({
      id,
      label: f.audio_quality?.replace(/audio_quality_/, "") ?? ar.audioLabel,
      ext,
      quality: f.quality_label ?? ar.audioLabel,
      filesizeLabel: "",
      hasVideo: false,
      hasAudio: true,
      directUrl: f.url?.startsWith("http") ? f.url : undefined,
    });
  }

  if (audioFormats.length === 0 && heightsAvailable.size > 0) {
    audioFormats.push({
      id: "inn-q-audio",
      label: ar.audioLabel,
      ext: "m4a",
      quality: ar.bestQuality,
      filesizeLabel: "",
      hasVideo: false,
      hasAudio: true,
    });
  }

  if (videoFormats.length === 0 && audioFormats.length === 0) return null;

  const thumb = basic.thumbnail?.[basic.thumbnail.length - 1]?.url;

  return {
    id: videoId,
    title: basic.title ?? ar.untitled,
    thumbnail: thumb,
    duration: basic.duration,
    uploader: basic.author,
    platform: "يوتيوب",
    webpageUrl,
    videoFormats,
    audioFormats,
    imageFormats: [],
  };
}

export function qualityFromInnertubeFormatId(formatId: string): {
  quality?: string;
  type?: "video" | "audio" | "video+audio";
} {
  if (formatId === "inn-q-audio" || formatId.startsWith("inn-a-") || formatId.startsWith("piped-a-")) {
    const itag = formatId.match(/inn-a-(\d+)/)?.[1];
    return { type: "audio", quality: itag ? "best" : "best" };
  }
  const itagOnly = formatId.match(/^inn-(\d+)$/);
  if (itagOnly) {
    return { type: "video+audio", quality: "best" };
  }
  const q = formatId.match(/inn-q-(\d{3,4})p/)?.[1] ?? formatId.match(/(\d{3,4})p/)?.[1];
  if (q) return { type: "video+audio", quality: `${q}p` };
  if (formatId.includes("1080")) return { type: "video+audio", quality: "1080p" };
  if (formatId.includes("720")) return { type: "video+audio", quality: "720p" };
  if (formatId.includes("480")) return { type: "video+audio", quality: "480p" };
  if (formatId.includes("360")) return { type: "video+audio", quality: "360p" };
  return { type: "video+audio", quality: "best" };
}

export function isInnertubeFormatId(formatId: string): boolean {
  return formatId.startsWith("inn-");
}
