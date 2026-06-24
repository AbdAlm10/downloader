"use client";

import { ar } from "./ar";
import type { MediaInfo } from "./types";
import { formatDuration } from "./utils";
import { fetchTextViaProxy } from "./cors-proxy";
import {
  detectClientPlatform,
  extractMediaFromHtml,
  platformLabel,
  type ClientPlatform,
} from "./client-extractors";
import { extractYouTubeVideoId } from "./youtube-piped";

export function canAnalyzeOnDevice(url: string): boolean {
  if (/youtube\.com|youtu\.be/i.test(url)) return true;
  return detectClientPlatform(url) !== null;
}

function toMediaInfo(
  extracted: ReturnType<typeof extractMediaFromHtml>,
  url: string,
  platform: ClientPlatform
): MediaInfo | null {
  if (!extracted) return null;
  if (
    extracted.videoFormats.length === 0 &&
    extracted.audioFormats.length === 0 &&
    extracted.imageFormats.length === 0
  ) {
    return null;
  }

  const videoId = extractYouTubeVideoId(url);

  return {
    id: videoId ?? "media",
    title: extracted.title,
    thumbnail: extracted.thumbnail,
    duration: undefined,
    durationLabel: formatDuration(undefined),
    uploader: undefined,
    platform: extracted.platform || platformLabel(platform, url),
    webpageUrl: url,
    videoFormats: extracted.videoFormats,
    audioFormats: extracted.audioFormats,
    imageFormats: extracted.imageFormats,
    analyzedOnDevice: true,
  };
}

/** Fetch page HTML through CORS proxy and extract public media URLs. */
export async function fetchMediaOnDevice(
  url: string,
  signal?: AbortSignal
): Promise<MediaInfo> {
  const platform = detectClientPlatform(url);
  if (!platform) {
    throw new Error(ar.unsupportedUrl);
  }

  const html = await fetchTextViaProxy(url, signal);
  const extracted = extractMediaFromHtml(html, platform, url);
  const info = toMediaInfo(extracted, url, platform);

  if (!info) {
    throw new Error(ar.noFormats);
  }

  return info;
}

export function isWebFormatId(formatId: string): boolean {
  return formatId.startsWith("web-");
}

export function shouldDownloadOnDevice(info: MediaInfo, formatId: string): boolean {
  if (!info.analyzedOnDevice) return false;
  if (/youtube|يوتيوب/i.test(info.platform) && formatId.startsWith("inn-")) return false;
  return formatId.startsWith("web-") || formatId.startsWith("inn-");
}
