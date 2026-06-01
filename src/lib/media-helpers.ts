import type { FormatOption, MediaInfo, MediaType } from "./types";
import { isYoutubePresetFormatId } from "./youtube-formats";

export function formatsForType(info: MediaInfo, type: MediaType): FormatOption[] {
  switch (type) {
    case "video":
      return info.videoFormats;
    case "audio":
      return info.audioFormats;
    case "image":
      return info.imageFormats;
  }
}

export function defaultMediaType(info: MediaInfo): MediaType {
  const isYoutube = /youtube|يوتيوب/i.test(info.platform);
  if (info.videoFormats.length > 0) return "video";
  if (info.audioFormats.length > 0) return "audio";
  if (!isYoutube && info.imageFormats.length > 0) return "image";
  return "video";
}

export function findFormat(info: MediaInfo, formatId: string): FormatOption | undefined {
  return (
    info.videoFormats.find((f) => f.id === formatId) ??
    info.audioFormats.find((f) => f.id === formatId) ??
    info.imageFormats.find((f) => f.id === formatId)
  );
}

export function buildDownloadParams(
  info: MediaInfo,
  format: FormatOption,
  formatId: string,
  mediaType: MediaType
): URLSearchParams {
  const params = new URLSearchParams({
    formatId,
    title: info.title,
    ext: format.ext,
  });

  if (format.directUrl) {
    params.set("directUrl", format.directUrl);
  } else {
    params.set("url", info.webpageUrl);
    const needsMerge =
      mediaType === "video" &&
      (isYoutubePresetFormatId(formatId) ||
        !format.hasAudio ||
        formatId.includes("+") ||
        formatId.includes("/"));
    if (needsMerge) {
      params.set("merge", "true");
    }
  }

  return params;
}
