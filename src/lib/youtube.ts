import { fetchYoutubeViaPiped } from "./youtube-piped";
import { fetchYoutubeViaInnertube } from "./youtube-innertube";
import type { MediaInfo } from "./types";
import { formatDuration } from "./utils";

function hasFormats(info: {
  videoFormats: unknown[];
  audioFormats: unknown[];
}): boolean {
  return info.videoFormats.length > 0 || info.audioFormats.length > 0;
}

function toMediaInfo(
  info: Omit<MediaInfo, "durationLabel">
): MediaInfo {
  return { ...info, durationLabel: formatDuration(info.duration) };
}

function maxVideoHeight(info: { videoFormats: { quality: string }[] }): number {
  return info.videoFormats.reduce((max, f) => {
    const h = parseInt(f.quality, 10);
    return Number.isFinite(h) && h > max ? h : max;
  }, 0);
}

function pickYoutubeInfo(
  a: Omit<MediaInfo, "durationLabel"> | null,
  b: Omit<MediaInfo, "durationLabel"> | null
): Omit<MediaInfo, "durationLabel"> | null {
  const aOk = a && hasFormats(a) ? a : null;
  const bOk = b && hasFormats(b) ? b : null;
  if (!aOk) return bOk;
  if (!bOk) return aOk;
  return maxVideoHeight(aOk) >= maxVideoHeight(bOk) ? aOk : bOk;
}

/** Fast YouTube path — InnerTube + Piped in parallel (avoids slow yt-dlp bot blocks on Render). */
export async function fetchYoutubeMediaInfo(url: string): Promise<MediaInfo | null> {
  const [innertube, piped] = await Promise.all([
    fetchYoutubeViaInnertube(url),
    fetchYoutubeViaPiped(url),
  ]);

  const best = pickYoutubeInfo(innertube, piped);
  return best ? toMediaInfo(best) : null;
}

export function isYoutubeUrl(url: string): boolean {
  return /youtube\.com|youtu\.be/i.test(url);
}

export function usesAltYoutubeDownload(formatId: string, directUrl?: string): boolean {
  return (
    Boolean(directUrl) ||
    formatId.startsWith("piped-") ||
    formatId.startsWith("inn-")
  );
}
