import type { FormatOption } from "./types";
import type { parseMediaInfo } from "./formats";
import { ar } from "./ar";

type ParsedMediaInfo = ReturnType<typeof parseMediaInfo>;

/** Short IDs for the API; mapped to yt-dlp format selectors on download. */
export const YT_FORMAT_SPECS: Record<string, string> = {
  "yt-v-best": "bestvideo*+bestaudio/best",
  "yt-v-1080": "bestvideo*[height<=1080]+bestaudio/best",
  "yt-v-720": "bestvideo*[height<=720]+bestaudio/best",
  "yt-v-480": "bestvideo*[height<=480]+bestaudio/best",
  "yt-v-360": "best",
  "yt-a-best": "bestaudio/best",
  "yt-a-m4a": "bestaudio[ext=m4a]/best",
  "yt-a-opus": "bestaudio[ext=opus]/best",
};

export function resolveYoutubeFormatSpec(formatId: string): string | null {
  return YT_FORMAT_SPECS[formatId] ?? null;
}

export function isYoutubePresetFormatId(formatId: string): boolean {
  return formatId in YT_FORMAT_SPECS;
}

/** yt-dlp format selectors — work even when -J returns no format list (server partial extract). */
export const YOUTUBE_VIDEO_PRESETS: FormatOption[] = [
  {
    id: "yt-v-best",
    label: ar.bestQuality,
    ext: "mp4",
    quality: ar.bestQuality,
    filesizeLabel: "",
    hasVideo: true,
    hasAudio: false,
  },
  {
    id: "yt-v-1080",
    label: "1080p",
    ext: "mp4",
    quality: "1080p",
    filesizeLabel: "",
    hasVideo: true,
    hasAudio: false,
  },
  {
    id: "yt-v-720",
    label: "720p",
    ext: "mp4",
    quality: "720p",
    filesizeLabel: "",
    hasVideo: true,
    hasAudio: false,
  },
  {
    id: "yt-v-480",
    label: "480p",
    ext: "mp4",
    quality: "480p",
    filesizeLabel: "",
    hasVideo: true,
    hasAudio: false,
  },
  {
    id: "yt-v-360",
    label: "360p " + ar.orLower,
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

/** Fill video/audio tabs when yt-dlp listed metadata but no stream formats (common on cloud hosts). */
export function applyYouTubeFormatPresets(info: ParsedMediaInfo): ParsedMediaInfo {
  if (!isYouTubeMedia(info)) return info;

  const videoFormats =
    info.videoFormats.length > 0 ? info.videoFormats : [...YOUTUBE_VIDEO_PRESETS];
  const audioFormats =
    info.audioFormats.length > 0 ? info.audioFormats : [...YOUTUBE_AUDIO_PRESETS];

  const thumbnail =
    info.id && info.id !== "media" ? stableYouTubeThumbnail(info.id) : info.thumbnail;

  const imageFormats = videoFormats.length > 0 ? [] : info.imageFormats;

  return {
    ...info,
    thumbnail,
    videoFormats,
    audioFormats,
    imageFormats,
  };
}
