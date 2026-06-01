import { Innertube, type Types } from "youtubei.js";
import { Readable } from "stream";
import type { FormatOption } from "./types";
import { ar } from "./ar";
import type { parseMediaInfo } from "./formats";
import { extractYouTubeVideoId } from "./youtube-piped";

type ParsedMediaInfo = ReturnType<typeof parseMediaInfo>;

const CLIENTS: Types.InnerTubeClient[] = ["ANDROID", "ANDROID_VR", "TV_EMBEDDED", "WEB_EMBEDDED"];

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

function formatHeightFromLabel(label?: string): number {
  const m = label?.match(/(\d{3,4})p/i);
  return m ? parseInt(m[1]!, 10) : 0;
}

function mapInnertubeInfo(
  basic: { title?: string; duration?: number; author?: string; thumbnail?: { url?: string }[] },
  streaming: {
    formats?: { itag?: number; quality_label?: string; mime_type?: string; has_audio?: boolean; has_video?: boolean; url?: string }[];
    adaptive_formats?: { itag?: number; quality_label?: string; mime_type?: string; has_audio?: boolean; has_video?: boolean; url?: string; audio_quality?: string }[];
  } | null,
  webpageUrl: string,
  videoId: string
): ParsedMediaInfo | null {
  const all = [...(streaming?.formats ?? []), ...(streaming?.adaptive_formats ?? [])].filter(
    (f) => f.url?.startsWith("http")
  );

  const videoFormats: FormatOption[] = [];
  const audioFormats: FormatOption[] = [];

  for (const f of all) {
    const hasVideo = f.has_video !== false && (f.mime_type?.includes("video") ?? false);
    const hasAudio = f.has_audio === true || (f.mime_type?.includes("audio") ?? false);
    const h = formatHeightFromLabel(f.quality_label);
    const ext = f.mime_type?.includes("webm") ? "webm" : f.mime_type?.includes("mp4") ? "mp4" : "mp4";

    if (hasVideo && h > 0) {
      videoFormats.push({
        id: `inn-${f.itag ?? h}`,
        label: `${h}p`,
        ext,
        quality: `${h}p`,
        filesizeLabel: "",
        hasVideo: true,
        hasAudio: !!f.has_audio,
        directUrl: f.url,
      });
    } else if (hasAudio && !hasVideo) {
      audioFormats.push({
        id: `inn-a-${f.itag ?? ext}`,
        label: ar.audioLabel,
        ext: ext.includes("opus") ? "opus" : "m4a",
        quality: f.quality_label ?? ar.audioLabel,
        filesizeLabel: "",
        hasVideo: false,
        hasAudio: true,
        directUrl: f.url,
      });
    }
  }

  if (videoFormats.length === 0 && audioFormats.length === 0) return null;

  const thumb = basic.thumbnail?.[basic.thumbnail.length - 1]?.url;

  return {
    id: videoId,
    title: basic.title ?? ar.untitled,
    thumbnail: thumb,
    duration: basic.duration,
    uploader: basic.author,
    platform: "يوتيوب",
    webpageUrl,
    videoFormats: [...new Map(videoFormats.map((f) => [f.quality, f])).values()].sort(
      (a, b) => parseInt(b.quality) - parseInt(a.quality)
    ),
    audioFormats,
    imageFormats: [],
  };
}

export async function fetchYoutubeViaInnertube(url: string): Promise<ParsedMediaInfo | null> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return null;

  const tube = await getInnertube();

  for (const client of CLIENTS) {
    try {
      const info = await tube.getBasicInfo(videoId, { client });
      const mapped = mapInnertubeInfo(
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

function qualityFromFormatId(formatId: string): { quality?: string; type?: "video" | "audio" | "video+audio" } {
  if (formatId.startsWith("inn-a-") || formatId.startsWith("piped-a-")) {
    return { type: "audio", quality: "best" };
  }
  const h = formatId.match(/(\d{3,4})p/)?.[1] ?? formatId.match(/inn-(\d+)/)?.[1];
  if (h) return { type: "video+audio", quality: `${h}p` };
  if (formatId.includes("1080")) return { type: "video+audio", quality: "1080p" };
  if (formatId.includes("720")) return { type: "video+audio", quality: "720p" };
  if (formatId.includes("480")) return { type: "video+audio", quality: "480p" };
  return { type: "video+audio", quality: "best" };
}

export async function createInnertubeDownloadStream(
  url: string,
  formatId: string
): Promise<Readable> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) throw new Error(ar.downloadFailed);

  const tube = await getInnertube();
  const opts = qualityFromFormatId(formatId);

  for (const client of CLIENTS) {
    try {
      const webStream = await tube.download(videoId, {
        ...opts,
        format: "mp4",
        client,
      });
      return Readable.fromWeb(webStream as import("stream/web").ReadableStream<Uint8Array>);
    } catch {
      continue;
    }
  }

  throw new Error(ar.downloadFailed);
}

export function isInnertubeFormatId(formatId: string): boolean {
  return formatId.startsWith("inn-");
}
