"use client";

import { ar } from "./ar";
import type { MediaInfo } from "./types";
import { formatDuration } from "./utils";
import { fetchTextViaProxy } from "./cors-proxy";
import { fetchViaPlatformApis } from "./platform-apis";
import {
  detectClientPlatform,
  extractMediaFromHtml,
  platformLabel,
  type ClientPlatform,
} from "./client-extractors";
import { extractYouTubeVideoId, isYoutubeUrl } from "./youtube-url";

export function isValidMediaUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function canAnalyzeOnDevice(url: string): boolean {
  if (isYoutubeUrl(url)) return true;
  return isValidMediaUrl(url);
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

/**
 * Analyze any supported URL on the user's device:
 * 1) free platform APIs (TikTok, Instagram, X, …)
 * 2) HTML/Open Graph via public CORS proxies
 */
export async function fetchMediaOnDevice(
  url: string,
  signal?: AbortSignal
): Promise<MediaInfo> {
  if (!isValidMediaUrl(url)) {
    throw new Error(ar.invalidUrl);
  }

  const fromApi = await fetchViaPlatformApis(url, signal);
  if (fromApi) return fromApi;

  const platform = detectClientPlatform(url);
  const html = await fetchTextViaProxy(url, signal);
  const extracted = extractMediaFromHtml(html, platform, url);
  const info = toMediaInfo(extracted, url, platform);

  if (!info) {
    throw new Error(ar.noFormats);
  }

  return info;
}

export function isWebFormatId(formatId: string): boolean {
  return formatId.startsWith("web-") || formatId.startsWith("api-");
}

export function shouldDownloadOnDevice(info: MediaInfo, formatId: string): boolean {
  if (!info.analyzedOnDevice) return false;
  if (/youtube|يوتيوب/i.test(info.platform) && formatId.startsWith("inn-")) return false;
  return formatId.startsWith("web-") || formatId.startsWith("api-") || formatId.startsWith("inn-");
}
