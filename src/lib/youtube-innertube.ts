import { Innertube } from "youtubei.js";
import { Readable } from "stream";
import type { parseMediaInfo } from "./formats";
import { extractYouTubeVideoId } from "./youtube-piped";
import { ar } from "./ar";
import {
  INNERTUBE_CLIENTS,
  mapInnertubeStreamingToInfo,
  qualityFromInnertubeFormatId,
  isInnertubeFormatId,
} from "./youtube-innertube-shared";

type ParsedMediaInfo = ReturnType<typeof parseMediaInfo>;

let tubePromise: Promise<Innertube> | null = null;

function getInnertube(): Promise<Innertube> {
  if (!tubePromise) {
    tubePromise = Innertube.create().catch((err) => {
      tubePromise = null;
      throw err;
    });
  }
  return tubePromise;
}

export async function fetchYoutubeViaInnertube(url: string): Promise<ParsedMediaInfo | null> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return null;

  const tube = await getInnertube();

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
        url,
        videoId
      );
      if (mapped) return mapped;
    } catch {
      continue;
    }
  }

  return null;
}

export async function createInnertubeDownloadStream(
  url: string,
  formatId: string
): Promise<Readable> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) throw new Error(ar.downloadFailed);

  const tube = await getInnertube();
  const opts = qualityFromInnertubeFormatId(formatId);
  const isAudio = opts.type === "audio";

  for (const client of INNERTUBE_CLIENTS) {
    try {
      const webStream = await tube.download(videoId, {
        ...opts,
        format: isAudio ? "m4a" : "mp4",
        client,
      });
      return Readable.fromWeb(webStream as import("stream/web").ReadableStream<Uint8Array>);
    } catch {
      continue;
    }
  }

  throw new Error(ar.downloadFailed);
}

/** Resolve a direct googlevideo URL for a format (muxed URL or deciphered stream). */
export async function resolveInnertubePlayableUrl(
  url: string,
  formatId: string
): Promise<string | null> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return null;

  const info = await fetchYoutubeViaInnertube(url);
  if (info) {
    const fmt = [...info.videoFormats, ...info.audioFormats].find((f) => f.id === formatId);
    if (fmt?.directUrl?.startsWith("http")) return fmt.directUrl;

    const height = formatId.match(/(\d{3,4})p/)?.[1];
    if (height) {
      const byQ = info.videoFormats.find(
        (f) => f.directUrl?.startsWith("http") && f.quality === `${height}p`
      );
      if (byQ?.directUrl) return byQ.directUrl;
    }

    const muxed = info.videoFormats.find((f) => f.directUrl?.startsWith("http") && f.hasAudio);
    if (muxed?.directUrl) return muxed.directUrl;
  }

  const tube = await getInnertube();
  const opts = qualityFromInnertubeFormatId(formatId);

  for (const client of INNERTUBE_CLIENTS) {
    try {
      const fmt = await tube.getStreamingData(videoId, {
        ...opts,
        format: "mp4",
        client,
      });
      if (fmt?.url?.startsWith("http")) return fmt.url;
      const player = tube.session?.player;
      if (fmt && player) {
        const deciphered = await fmt.decipher(player);
        if (deciphered.startsWith("http")) return deciphered;
      }
    } catch {
      continue;
    }
  }

  return null;
}

export { isInnertubeFormatId };
