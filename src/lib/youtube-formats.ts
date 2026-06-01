import type { FormatOption } from "./types";
import type { parseMediaInfo } from "./formats";
import { ar } from "./ar";

type ParsedMediaInfo = ReturnType<typeof parseMediaInfo>;

/** yt-dlp format selectors — work even when -J returns no format list (server partial extract). */
export const YOUTUBE_VIDEO_PRESETS: FormatOption[] = [
  {
    id: "bestvideo*+bestaudio/best",
    label: ar.bestQuality,
    ext: "mp4",
    quality: ar.bestQuality,
    filesizeLabel: "",
    hasVideo: true,
    hasAudio: false,
  },
  {
    id: "bestvideo*[height<=1080]+bestaudio/best",
    label: "1080p",
    ext: "mp4",
    quality: "1080p",
    filesizeLabel: "",
    hasVideo: true,
    hasAudio: false,
  },
  {
    id: "bestvideo*[height<=720]+bestaudio/best",
    label: "720p",
    ext: "mp4",
    quality: "720p",
    filesizeLabel: "",
    hasVideo: true,
    hasAudio: false,
  },
  {
    id: "bestvideo*[height<=480]+bestaudio/best",
    label: "480p",
    ext: "mp4",
    quality: "480p",
    filesizeLabel: "",
    hasVideo: true,
    hasAudio: false,
  },
  {
    id: "best",
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
    id: "bestaudio/best",
    label: ar.bestQuality,
    ext: "m4a",
    quality: ar.bestQuality,
    filesizeLabel: "",
    hasVideo: false,
    hasAudio: true,
  },
  {
    id: "bestaudio[ext=m4a]/best",
    label: "M4A",
    ext: "m4a",
    quality: "M4A",
    filesizeLabel: "",
    hasVideo: false,
    hasAudio: true,
  },
  {
    id: "bestaudio[ext=opus]/best",
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

  const imageFormats =
    videoFormats.length > 0
      ? []
      : info.imageFormats;

  return {
    ...info,
    thumbnail,
    videoFormats,
    audioFormats,
    imageFormats,
  };
}

export function isYoutubeFormatSelector(formatId: string): boolean {
  return /best|\[height|\+|\//i.test(formatId);
}
