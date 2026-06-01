import type { FormatOption } from "./types";
import type { parseMediaInfo } from "./formats";
import { ar } from "./ar";

type ParsedMediaInfo = ReturnType<typeof parseMediaInfo>;

/**
 * Pre-muxed / single-file selectors — no ffmpeg merge step (reliable on Render).
 * yt-dlp format IDs for merge-heavy paths are mapped separately on download.
 */
export const YT_FORMAT_SPECS: Record<string, string> = {
  "yt-v-best": "best[ext=mp4]/best[ext=mp4]/best",
  "yt-v-1080": "best[height<=1080][ext=mp4]/best[height<=1080]/best",
  "yt-v-720": "best[height<=720][ext=mp4]/best[height<=720]/best",
  "yt-v-480": "best[height<=480][ext=mp4]/best[height<=480]/best",
  "yt-v-360": "best[height<=360][ext=mp4]/best[height<=360]/best",
  "yt-a-best": "bestaudio[ext=m4a]/bestaudio/best",
  "yt-a-m4a": "bestaudio[ext=m4a]/bestaudio/best",
  "yt-a-opus": "bestaudio[ext=opus]/bestaudio/best",
};

export function resolveYoutubeFormatSpec(formatId: string): string | null {
  return YT_FORMAT_SPECS[formatId] ?? null;
}

export function isYoutubePresetFormatId(formatId: string): boolean {
  return formatId in YT_FORMAT_SPECS;
}

export const YOUTUBE_VIDEO_PRESETS: FormatOption[] = [
  {
    id: "yt-v-best",
    label: ar.bestQuality,
    ext: "mp4",
    quality: ar.bestQuality,
    filesizeLabel: "",
    hasVideo: true,
    hasAudio: true,
  },
  {
    id: "yt-v-1080",
    label: "1080p",
    ext: "mp4",
    quality: "1080p",
    filesizeLabel: "",
    hasVideo: true,
    hasAudio: true,
  },
  {
    id: "yt-v-720",
    label: "720p",
    ext: "mp4",
    quality: "720p",
    filesizeLabel: "",
    hasVideo: true,
    hasAudio: true,
  },
  {
    id: "yt-v-480",
    label: "480p",
    ext: "mp4",
    quality: "480p",
    filesizeLabel: "",
    hasVideo: true,
    hasAudio: true,
  },
  {
    id: "yt-v-360",
    label: "360p",
    ext: "mp4",
    quality: "360p",
    filesizeLabel: "",
    hasVideo: true,
    hasAudio: true,
  },
];

export const YOUTUBE_AUDIO_PRESETS: FormatOption[] = [
  {
    id: "yt-a-best",
    label: ar.bestQuality,
    ext: "m4a",
    quality: ar.bestQuality,
    filesizeLabel: "",
    hasVideo: false,
    hasAudio: true,
  },
  {
    id: "yt-a-m4a",
    label: "M4A",
    ext: "m4a",
    quality: "M4A",
    filesizeLabel: "",
    hasVideo: false,
    hasAudio: true,
  },
  {
    id: "yt-a-opus",
    label: "Opus",
    ext: "opus",
    quality: "Opus",
    filesizeLabel: "",
    hasVideo: false,
    hasAudio: true,
  },
];

export function isYouTubeMedia(info: ParsedMediaInfo): boolean {
  return /youtube|يوتيوب/i.test(info.platform);
}

function stableYouTubeThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/** Stable thumbnail only — do not inject yt-dlp preset IDs (they fail with bot checks on cloud IPs). */
export function applyYouTubeFormatPresets(info: ParsedMediaInfo): ParsedMediaInfo {
  if (!isYouTubeMedia(info)) return info;

  const thumbnail =
    info.id && info.id !== "media" ? stableYouTubeThumbnail(info.id) : info.thumbnail;

  const imageFormats = info.videoFormats.length > 0 ? [] : info.imageFormats;

  return {
    ...info,
    thumbnail,
    imageFormats,
  };
}
