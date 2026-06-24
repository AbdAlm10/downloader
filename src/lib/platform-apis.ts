"use client";

import { ar } from "./ar";
import type { FormatOption, MediaInfo } from "./types";
import { formatDuration } from "./utils";
import { fetchJsonFromApi, fetchTextViaProxyChain } from "./public-cors-proxies";
import { platformLabel, type ClientPlatform } from "./client-extractors";

function apiFormat(
  kind: "v" | "a" | "img",
  id: string,
  url: string,
  label: string,
  ext: string
): FormatOption {
  return {
    id: `api-${id}`,
    label,
    ext,
    quality: label,
    filesizeLabel: "",
    hasVideo: kind === "v" || kind === "img",
    hasAudio: kind !== "img",
    directUrl: url,
  };
}

function baseInfo(
  url: string,
  platform: ClientPlatform,
  title: string,
  thumbnail: string | undefined,
  videoFormats: FormatOption[],
  audioFormats: FormatOption[] = [],
  imageFormats: FormatOption[] = []
): MediaInfo {
  return {
    id: "media",
    title,
    thumbnail,
    durationLabel: formatDuration(undefined),
    platform: platformLabel(platform, url),
    webpageUrl: url,
    videoFormats,
    audioFormats,
    imageFormats,
    analyzedOnDevice: true,
  };
}

function extractInstagramShortcode(url: string): string | null {
  const m = url.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  return m?.[1] ?? null;
}

function extractTwitterId(url: string): string | null {
  const m = url.match(/(?:twitter|x)\.com\/[^/]+\/status\/(\d+)/i);
  return m?.[1] ?? null;
}

function extractRedditPermalink(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/reddit\.com/i.test(u.hostname)) return null;
    const path = u.pathname.replace(/\/$/, "");
    if (!path.includes("/comments/")) return null;
    return `https://www.reddit.com${path}.json`;
  } catch {
    return null;
  }
}

function extractVimeoId(url: string): string | null {
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  return m?.[1] ?? null;
}

async function tryTikTok(url: string, signal?: AbortSignal): Promise<MediaInfo | null> {
  const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`;
  const data = await fetchJsonFromApi<{
    code?: number;
    data?: {
      title?: string;
      cover?: string;
      hdplay?: string;
      play?: string;
      wmplay?: string;
      music?: string;
    };
  }>(apiUrl, signal);

  const d = data?.data;
  const videoUrl = d?.hdplay || d?.play || d?.wmplay;
  if (!videoUrl?.startsWith("http") || !d) return null;

  const videoFormats = [
    apiFormat("v", "tiktok-hd", videoUrl, ar.bestQuality, "mp4"),
  ];
  const audioFormats: FormatOption[] = [];
  if (d.music?.startsWith("http")) {
    audioFormats.push(apiFormat("a", "tiktok-music", d.music, ar.audioLabel, "mp3"));
  }

  return baseInfo(url, "tiktok", d.title ?? ar.untitled, d.cover, videoFormats, audioFormats);
}

async function tryTwitter(url: string, signal?: AbortSignal): Promise<MediaInfo | null> {
  const id = extractTwitterId(url);
  if (!id) return null;

  const apiUrl = `https://api.vxtwitter.com/Twitter/status/${id}`;
  const data = await fetchJsonFromApi<{
    text?: string;
    author?: { name?: string };
    media_extended?: { type?: string; url?: string; thumbnail_url?: string }[];
    mediaURLs?: string[];
  }>(apiUrl, signal);

  const media = data?.media_extended ?? [];
  const videoFormats: FormatOption[] = [];
  const imageFormats: FormatOption[] = [];
  let thumb: string | undefined;

  for (let i = 0; i < media.length; i++) {
    const m = media[i]!;
    if (!m.url?.startsWith("http")) continue;
    if (m.type === "video" || m.type === "gif") {
      videoFormats.push(apiFormat("v", `twitter-${i}`, m.url, ar.bestQuality, "mp4"));
      thumb = thumb ?? m.thumbnail_url;
    } else if (m.type === "image") {
      imageFormats.push(apiFormat("img", `twitter-${i}`, m.url, ar.original, "jpg"));
      thumb = thumb ?? m.url;
    }
  }

  if (videoFormats.length === 0 && imageFormats.length === 0 && data?.mediaURLs?.length) {
    for (let i = 0; i < data.mediaURLs.length; i++) {
      const u = data.mediaURLs[i]!;
      if (!u.startsWith("http")) continue;
      if (/\.(mp4|webm)(\?|$)/i.test(u)) {
        videoFormats.push(apiFormat("v", `twitter-${i}`, u, ar.bestQuality, "mp4"));
      } else {
        imageFormats.push(apiFormat("img", `twitter-${i}`, u, ar.original, "jpg"));
      }
    }
  }

  if (videoFormats.length === 0 && imageFormats.length === 0) return null;

  return baseInfo(
    url,
    "twitter",
    data?.text?.slice(0, 120) ?? data?.author?.name ?? ar.untitled,
    thumb,
    videoFormats,
    [],
    imageFormats
  );
}

async function tryInstagram(url: string, signal?: AbortSignal): Promise<MediaInfo | null> {
  const shortcode = extractInstagramShortcode(url);
  if (!shortcode) return null;

  const oembedUrl = `https://www.instagram.com/api/v1/oembed/?url=${encodeURIComponent(url)}`;
  const oembed = await fetchJsonFromApi<{
    title?: string;
    thumbnail_url?: string;
  }>(oembedUrl, signal);

  const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
  let videoUrl: string | null = null;
  let imageUrl: string | null = oembed?.thumbnail_url ?? null;

  try {
    const html = await fetchTextViaProxyChain(embedUrl, signal);
    const videoMatch =
      html.match(/"video_url":"([^"]+)"/) ??
      html.match(/video_url\\":\\"([^"\\]+)/);
    if (videoMatch?.[1]) {
      videoUrl = videoMatch[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/");
    }
    const imgMatch = html.match(/"display_url":"([^"]+)"/);
    if (imgMatch?.[1]) {
      imageUrl = imgMatch[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/");
    }
  } catch {
    /* embed scrape optional */
  }

  const videoFormats: FormatOption[] = [];
  const imageFormats: FormatOption[] = [];

  if (videoUrl?.startsWith("http")) {
    videoFormats.push(apiFormat("v", "ig-video", videoUrl, ar.bestQuality, "mp4"));
  }
  if (imageUrl?.startsWith("http") && imageUrl !== videoUrl) {
    imageFormats.push(apiFormat("img", "ig-image", imageUrl, ar.original, "jpg"));
  }

  if (videoFormats.length === 0 && imageFormats.length === 0) return null;

  return baseInfo(
    url,
    "instagram",
    oembed?.title ?? ar.untitled,
    imageUrl ?? oembed?.thumbnail_url,
    videoFormats,
    [],
    imageFormats
  );
}

async function tryReddit(url: string, signal?: AbortSignal): Promise<MediaInfo | null> {
  const jsonUrl = extractRedditPermalink(url);
  if (!jsonUrl) return null;

  const data = await fetchJsonFromApi<unknown[]>(jsonUrl, signal);
  const post = (data?.[0] as { data?: { children?: { data?: Record<string, unknown> }[] } })
    ?.data?.children?.[0]?.data;
  if (!post) return null;

  const title = String(post.title ?? ar.untitled);
  const thumbnail = typeof post.thumbnail === "string" && post.thumbnail.startsWith("http")
    ? post.thumbnail
    : undefined;

  const videoFormats: FormatOption[] = [];
  const imageFormats: FormatOption[] = [];
  const audioFormats: FormatOption[] = [];

  const fallbackUrl = typeof post.url_overridden_by_dest === "string" ? post.url_overridden_by_dest : "";
  const redditVideo = post.secure_media as { reddit_video?: { fallback_url?: string; has_audio?: boolean } } | undefined;
  const rv = redditVideo?.reddit_video;

  if (rv?.fallback_url?.startsWith("http")) {
    videoFormats.push(
      apiFormat("v", "reddit-video", rv.fallback_url, ar.bestQuality, "mp4")
    );
  } else if (/\.(mp4|webm)(\?|$)/i.test(fallbackUrl)) {
    videoFormats.push(apiFormat("v", "reddit-link", fallbackUrl, ar.bestQuality, "mp4"));
  } else if (/\.(jpe?g|png|gif|webp)(\?|$)/i.test(fallbackUrl)) {
    imageFormats.push(apiFormat("img", "reddit-image", fallbackUrl, ar.original, "jpg"));
  } else if (fallbackUrl.includes("v.redd.it") && fallbackUrl.startsWith("http")) {
    videoFormats.push(apiFormat("v", "reddit-v", fallbackUrl, ar.bestQuality, "mp4"));
  }

  const preview = post.preview as { images?: { source?: { url?: string } }[] } | undefined;
  const previewUrl = preview?.images?.[0]?.source?.url?.replace(/&amp;/g, "&");
  if (imageFormats.length === 0 && previewUrl?.startsWith("http")) {
    imageFormats.push(apiFormat("img", "reddit-preview", previewUrl, ar.original, "jpg"));
  }

  if (videoFormats.length === 0 && imageFormats.length === 0 && audioFormats.length === 0) {
    return null;
  }

  return baseInfo(url, "generic", title, thumbnail, videoFormats, audioFormats, imageFormats);
}

async function tryVimeo(url: string, signal?: AbortSignal): Promise<MediaInfo | null> {
  const id = extractVimeoId(url);
  if (!id) return null;

  const apiUrl = `https://vimeo.com/api/v2/video/${id}.json`;
  const data = await fetchJsonFromApi<{ title?: string; thumbnail_large?: string; url?: string }[]>(
    apiUrl,
    signal
  );
  const item = data?.[0];
  if (!item?.url?.startsWith("http")) return null;

  return baseInfo(
    url,
    "generic",
    item.title ?? ar.untitled,
    item.thumbnail_large,
    [apiFormat("v", "vimeo", item.url, ar.bestQuality, "mp4")]
  );
}

async function tryFacebook(url: string, signal?: AbortSignal): Promise<MediaInfo | null> {
  const pluginUrl = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}`;
  let html: string;
  try {
    html = await fetchTextViaProxyChain(pluginUrl, signal);
  } catch {
    return null;
  }

  const hd =
    html.match(/hd_src:"([^"]+)"/)?.[1] ??
    html.match(/hd_src_no_ratelimit:"([^"]+)"/)?.[1];
  const sd =
    html.match(/sd_src:"([^"]+)"/)?.[1] ??
    html.match(/sd_src_no_ratelimit:"([^"]+)"/)?.[1];
  const videoUrl = hd ?? sd;
  if (!videoUrl?.startsWith("http")) return null;

  const title =
    html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)?.[1] ??
    ar.untitled;
  const thumb =
    html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)?.[1];

  return baseInfo(
    url,
    "facebook",
    title,
    thumb,
    [apiFormat("v", "fb-hd", videoUrl, hd ? "HD" : ar.bestQuality, "mp4")]
  );
}

async function tryDailymotion(url: string, signal?: AbortSignal): Promise<MediaInfo | null> {
  const m = url.match(/dailymotion\.com\/video\/([a-zA-Z0-9]+)/i);
  if (!m?.[1]) return null;

  const apiUrl = `https://www.dailymotion.com/services/oembed?url=${encodeURIComponent(url)}&format=json`;
  const data = await fetchJsonFromApi<{ title?: string; thumbnail_url?: string }>(apiUrl, signal);
  const pageUrl = `https://www.dailymotion.com/player/metadata/video/${m[1]}`;
  const meta = await fetchJsonFromApi<{
    title?: string;
    thumbnails?: Record<string, string>;
    qualities?: Record<string, { type?: string; url?: string }>;
  }>(pageUrl, signal);

  const qualities = meta?.qualities ?? {};
  const best = Object.entries(qualities)
    .filter(([, q]) => q.type === "video" && q.url?.startsWith("http"))
    .sort((a, b) => parseInt(b[0], 10) - parseInt(a[0], 10))[0]?.[1]?.url;

  if (!best) return null;

  return baseInfo(
    url,
    "generic",
    meta?.title ?? data?.title ?? ar.untitled,
    data?.thumbnail_url ?? meta?.thumbnails?.["720"],
    [apiFormat("v", "dm", best, ar.bestQuality, "mp4")]
  );
}

type PlatformTry = (url: string, signal?: AbortSignal) => Promise<MediaInfo | null>;

const PLATFORM_TRIES: { match: RegExp; try: PlatformTry }[] = [
  { match: /tiktok\.com|vm\.tiktok|vt\.tiktok/i, try: tryTikTok },
  { match: /twitter\.com|x\.com/i, try: tryTwitter },
  { match: /instagram\.com/i, try: tryInstagram },
  { match: /reddit\.com/i, try: tryReddit },
  { match: /vimeo\.com/i, try: tryVimeo },
  { match: /facebook\.com|fb\.watch|fb\.com/i, try: tryFacebook },
  { match: /dailymotion\.com/i, try: tryDailymotion },
];

/** Fast path: free third-party APIs (no own server). */
export async function fetchViaPlatformApis(
  url: string,
  signal?: AbortSignal
): Promise<MediaInfo | null> {
  for (const { match, try: fn } of PLATFORM_TRIES) {
    if (!match.test(url)) continue;
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      const result = await fn(url, signal);
      if (result) return result;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
    }
  }
  return null;
}
