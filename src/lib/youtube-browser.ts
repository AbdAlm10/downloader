"use client";

import { ar } from "./ar";
import type { MediaInfo } from "./types";
import { formatDuration } from "./utils";
import { fetchYoutubeViaEdge } from "./youtube-edge";
import { extractYouTubeVideoId, isYoutubeUrl, normalizeYoutubeWatchUrl } from "./youtube-url";
import {
  downloadGoogleVideoStream,
  fetchYoutubePlayerDirect,
  resolveYoutubeStreamUrl,
} from "./youtube-innertube-direct";
import { fetchYoutubeViaPiped } from "./youtube-piped";
import { fetchYoutubeFromWatchPage } from "./youtube-watch-scrape";
import {
  INNERTUBE_CLIENTS,
  mapInnertubeStreamingToInfo,
  qualityFromInnertubeFormatId,
} from "./youtube-innertube-shared";

type YoutubeCandidate = {
  id: string;
  title: string;
  thumbnail?: string;
  duration?: number;
  uploader?: string;
  platform: string;
  webpageUrl: string;
  videoFormats: MediaInfo["videoFormats"];
  audioFormats: MediaInfo["audioFormats"];
  imageFormats: MediaInfo["imageFormats"];
};

function hasFormats(info: YoutubeCandidate | MediaInfo | null): boolean {
  return Boolean(info && (info.videoFormats.length > 0 || info.audioFormats.length > 0));
}

function formatScore(info: YoutubeCandidate | MediaInfo | null): number {
  if (!info) return 0;
  return info.videoFormats.length * 10 + info.audioFormats.length;
}

function toMediaInfo(mapped: YoutubeCandidate): MediaInfo {
  return {
    ...mapped,
    durationLabel: formatDuration(mapped.duration),
    analyzedOnDevice: true,
  };
}

function pickBest(...candidates: (YoutubeCandidate | MediaInfo | null)[]): MediaInfo | null {
  let best: MediaInfo | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    if (!c) continue;
    const score = formatScore(c);
    if (score > bestScore) {
      const info: MediaInfo = {
        ...c,
        durationLabel:
          "durationLabel" in c && c.durationLabel
            ? c.durationLabel
            : formatDuration(c.duration),
        analyzedOnDevice:
          "analyzedOnDevice" in c ? Boolean(c.analyzedOnDevice) : true,
      };
      best = info;
      bestScore = score;
    }
  }
  return best;
}

async function fetchViaYoutubeiLib(
  videoId: string,
  webpageUrl: string
): Promise<YoutubeCandidate | null> {
  try {
    const { Innertube } = await import("youtubei.js/web");
    const tube = await Promise.race([
      Innertube.create({
        fetch: async (input, init) => {
          const target = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
          if (/youtube\.com\/youtubei|youtubei\.googleapis\.com/.test(target)) {
            return fetch(target, init);
          }
          return fetch(input, init);
        },
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("timeout")), 25_000);
      }),
    ]);

    for (const client of INNERTUBE_CLIENTS) {
      try {
        const info = await tube.getBasicInfo(videoId, { client });
        const mapped = mapInnertubeStreamingToInfo(
          {
            title: info.basic_info?.title,
            duration: info.basic_info?.duration,
            author: info.basic_info?.author,
            thumbnail: info.basic_info?.thumbnail,
          },
          info.streaming_data ?? null,
          webpageUrl,
          videoId
        );
        if (mapped && hasFormats(mapped)) {
          return mapped;
        }
      } catch {
        continue;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Analyze YouTube:
 * 1) Netlify Edge /api/youtube/info (works for all links on production)
 * 2) Browser InnerTube + Piped + watch-page fallbacks (localhost / backup)
 */
export async function fetchYoutubeOnDevice(url: string, signal?: AbortSignal): Promise<MediaInfo> {
  if (!isYoutubeUrl(url)) throw new Error(ar.invalidUrl);

  const videoId = extractYouTubeVideoId(url);
  if (!videoId) throw new Error(ar.invalidUrl);

  const watchUrl = normalizeYoutubeWatchUrl(url)!;

  const edge = await fetchYoutubeViaEdge(url, signal);
  if (hasFormats(edge)) return edge!;

  const [direct, piped, fromLib, fromPage] = await Promise.all([
    fetchYoutubePlayerDirect(videoId, watchUrl, signal),
    fetchYoutubeViaPiped(url, signal),
    fetchViaYoutubeiLib(videoId, watchUrl),
    fetchYoutubeFromWatchPage(videoId, watchUrl, signal),
  ]);

  const best = pickBest(direct, fromLib, fromPage, piped);
  if (best) return best;

  throw new Error(ar.youtubeEngineMissing);
}

export async function downloadYoutubeOnDevice(
  url: string,
  formatId: string,
  options: {
    signal?: AbortSignal;
    onProgress?: (loaded: number) => void;
  } = {}
): Promise<Blob> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) throw new Error(ar.downloadFailed);

  const streamUrl = await resolveYoutubeStreamUrl(videoId, formatId, options.signal);
  if (streamUrl) {
    return downloadGoogleVideoStream(streamUrl, options);
  }

  try {
    const { Innertube } = await import("youtubei.js/web");
    const tube = await Innertube.create();
    const opts = qualityFromInnertubeFormatId(formatId);
    const isAudio = opts.type === "audio";
    const ext = isAudio ? "m4a" : "mp4";

    for (const client of INNERTUBE_CLIENTS) {
      if (options.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      try {
        const webStream = await tube.download(videoId, {
          ...opts,
          format: ext,
          client,
        });

        const reader = (webStream as ReadableStream<Uint8Array>).getReader();
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

        const mime = isAudio ? "audio/mp4" : "video/mp4";
        return new Blob(chunks as BlobPart[], { type: mime });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") throw err;
        continue;
      }
    }
  } catch {
    /* fall through */
  }

  throw new Error(ar.downloadFailed);
}

export function shouldAnalyzeYoutubeOnDevice(url: string): boolean {
  return isYoutubeUrl(url);
}

export function shouldDownloadYoutubeOnDevice(platform: string, formatId: string): boolean {
  return /youtube|يوتيوب/i.test(platform) && formatId.startsWith("inn-");
}
