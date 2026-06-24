"use client";

import { ar } from "./ar";
import type { DownloadProgressState } from "./download-client";
import type { FormatOption, MediaInfo } from "./types";
import { downloadYoutubeOnDevice } from "./youtube-browser";
import { resolveYoutubeStreamUrl } from "./youtube-innertube-direct";
import { extractYouTubeVideoId } from "./youtube-piped";

export class YoutubeNavigateDownload extends Error {
  constructor() {
    super(ar.downloadOpenedExternally);
    this.name = "YoutubeNavigateDownload";
  }
}

export function isYoutubeNavigateError(err: unknown): boolean {
  return (
    err instanceof YoutubeNavigateDownload ||
    (err instanceof Error && err.name === "YoutubeNavigateDownload")
  );
}

function isGoogleVideoUrl(url: string): boolean {
  return /googlevideo\.com|gvt1\.com|youtube\.com\/videoplayback/i.test(url);
}

function pickPlayableUrl(info: MediaInfo, format: FormatOption): string | null {
  if (format.directUrl?.startsWith("http")) return format.directUrl;

  const muxed = info.videoFormats.find((f) => f.directUrl?.startsWith("http") && f.hasAudio);
  if (muxed?.directUrl) return muxed.directUrl;

  const any = info.videoFormats.find((f) => f.directUrl?.startsWith("http"));
  if (any?.directUrl) return any.directUrl;

  const audio = info.audioFormats.find((f) => f.directUrl?.startsWith("http"));
  return audio?.directUrl ?? null;
}

function openStreamInBrowser(streamUrl: string): never {
  window.open(streamUrl, "_blank", "noopener,noreferrer");
  throw new YoutubeNavigateDownload();
}

/** Download YouTube entirely in the browser — no server. */
export async function downloadYoutubeFormat(
  info: MediaInfo,
  format: FormatOption,
  formatId: string,
  _mediaType: "video" | "audio" | "image",
  options: {
    signal?: AbortSignal;
    onProgress: (state: DownloadProgressState) => void;
  }
): Promise<Blob> {
  const videoId = extractYouTubeVideoId(info.webpageUrl);
  if (!videoId) throw new Error(ar.downloadFailed);

  if (format.directUrl?.startsWith("http") && !isGoogleVideoUrl(format.directUrl)) {
    const { downloadMediaUrl } = await import("./cors-proxy");
    const blob = await downloadMediaUrl(format.directUrl, {
      signal: options.signal,
      onProgress: (loaded, total) =>
        options.onProgress({
          loaded,
          total,
          percent: total ? Math.min(99, Math.round((loaded / total) * 100)) : null,
        }),
    });
    return blob;
  }

  try {
    const blob = await downloadYoutubeOnDevice(info.webpageUrl, formatId, {
      signal: options.signal,
      onProgress: (loaded) =>
        options.onProgress({
          loaded,
          total: format.filesize ?? null,
          percent: format.filesize
            ? Math.min(99, Math.round((loaded / format.filesize) * 100))
            : null,
        }),
    });
    if (blob.size > 0) return blob;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    if (isYoutubeNavigateError(err)) throw err;
  }

  const playable =
    pickPlayableUrl(info, format) ??
    (await resolveYoutubeStreamUrl(videoId, formatId, options.signal));

  if (playable && isGoogleVideoUrl(playable)) {
    openStreamInBrowser(playable);
  }

  if (playable && !isGoogleVideoUrl(playable)) {
    const { downloadMediaUrl } = await import("./cors-proxy");
    return downloadMediaUrl(playable, {
      signal: options.signal,
      onProgress: (loaded, total) =>
        options.onProgress({
          loaded,
          total,
          percent: total ? Math.min(99, Math.round((loaded / total) * 100)) : null,
        }),
    });
  }

  throw new Error(ar.downloadFailed);
}
