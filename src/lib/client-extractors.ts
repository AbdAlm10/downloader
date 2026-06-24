import type { FormatOption } from "./types";
import { ar } from "./ar";

export type ClientPlatform =
  | "instagram"
  | "tiktok"
  | "twitter"
  | "facebook"
  | "pinterest"
  | "generic";

export interface ExtractedMedia {
  title: string;
  thumbnail?: string;
  platform: string;
  videoFormats: FormatOption[];
  audioFormats: FormatOption[];
  imageFormats: FormatOption[];
}

function metaContent(html: string, property: string): string | null {
  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`,
      "i"
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeHtmlEntities(m[1]);
  }
  return null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function unescapeJsonString(raw: string): string {
  try {
    return JSON.parse(`"${raw.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
  } catch {
    return raw
      .replace(/\\u0026/g, "&")
      .replace(/\\u002F/g, "/")
      .replace(/\\\//g, "/")
      .replace(/\\"/g, '"');
  }
}

function firstMatch(html: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) {
      const url = unescapeJsonString(m[1].trim());
      if (url.startsWith("http")) return url;
    }
  }
  return null;
}

function extFromUrl(url: string, fallback: string): string {
  try {
    const path = new URL(url).pathname.toLowerCase();
    const m = path.match(/\.(mp4|webm|m4a|mp3|jpe?g|png|webp|gif)(?:\?|$)/);
    return m?.[1]?.replace("jpeg", "jpg") ?? fallback;
  } catch {
    return fallback;
  }
}

function webFormat(
  kind: "v" | "a" | "img",
  index: number,
  url: string,
  label: string,
  ext: string,
  opts: Partial<FormatOption> = {}
): FormatOption {
  return {
    id: `web-${kind}-${index}`,
    label,
    ext,
    quality: label,
    filesizeLabel: "",
    hasVideo: kind === "v" || kind === "img",
    hasAudio: kind === "a" || (kind === "v" && opts.hasAudio !== false),
    directUrl: url,
    ...opts,
  };
}

function dedupeUrls(urls: string[]): string[] {
  return [...new Set(urls.filter((u) => u.startsWith("http")))];
}

export function detectClientPlatform(url: string): ClientPlatform {
  if (/instagram\.com/i.test(url)) return "instagram";
  if (/tiktok\.com|vm\.tiktok|vt\.tiktok/i.test(url)) return "tiktok";
  if (/twitter\.com|x\.com/i.test(url)) return "twitter";
  if (/facebook\.com|fb\.watch|fb\.com/i.test(url)) return "facebook";
  if (/pinterest\.com|pin\.it/i.test(url)) return "pinterest";
  return "generic";
}

export function platformLabel(platform: ClientPlatform, url: string): string {
  const map: Record<ClientPlatform, string> = {
    instagram: "إنستغرام",
    tiktok: "تيك توك",
    twitter: "إكس",
    facebook: "فيسبوك",
    pinterest: "بينتريست",
    generic: "وسائط",
  };
  if (platform === "generic") {
    try {
      const host = new URL(url).hostname.replace(/^www\./, "");
      return host.split(".")[0] ?? map.generic;
    } catch {
      return map.generic;
    }
  }
  return map[platform];
}

function extractOpenGraph(html: string): ExtractedMedia | null {
  const title =
    metaContent(html, "og:title") ??
    metaContent(html, "twitter:title") ??
    metaContent(html, "title") ??
    ar.untitled;
  const thumbnail =
    metaContent(html, "og:image") ?? metaContent(html, "twitter:image") ?? undefined;

  const videoUrls = dedupeUrls(
    [
      metaContent(html, "og:video:url"),
      metaContent(html, "og:video:secure_url"),
      metaContent(html, "og:video"),
      metaContent(html, "twitter:player:stream"),
    ].filter((u): u is string => Boolean(u))
  );

  const audioUrls = dedupeUrls(
    [metaContent(html, "og:audio"), metaContent(html, "og:audio:secure_url")].filter(
      (u): u is string => Boolean(u)
    )
  );

  const imageUrls = dedupeUrls(
    [
      metaContent(html, "og:image:secure_url"),
      metaContent(html, "og:image"),
      metaContent(html, "twitter:image"),
    ].filter((u): u is string => Boolean(u))
  );

  const videoFormats = videoUrls.map((u, i) =>
    webFormat("v", i, u, ar.bestQuality, extFromUrl(u, "mp4"), { hasAudio: true })
  );
  const audioFormats = audioUrls.map((u, i) =>
    webFormat("a", i, u, ar.audioLabel, extFromUrl(u, "m4a"))
  );
  const imageFormats = imageUrls.map((u, i) =>
    webFormat("img", i, u, ar.original, extFromUrl(u, "jpg"))
  );

  if (videoFormats.length + audioFormats.length + imageFormats.length === 0) return null;

  return {
    title,
    thumbnail,
    platform: "وسائط",
    videoFormats,
    audioFormats,
    imageFormats,
  };
}

function extractInstagram(html: string): ExtractedMedia | null {
  const title = metaContent(html, "og:title") ?? ar.untitled;
  const thumbnail = metaContent(html, "og:image") ?? undefined;

  const videoUrl =
    metaContent(html, "og:video:secure_url") ??
    metaContent(html, "og:video") ??
    firstMatch(html, [
      /"video_url":"([^"]+)"/,
      /"contentUrl":"(https:[^"]+\.mp4[^"]*)"/,
    ]);

  const imageUrl =
    metaContent(html, "og:image:secure_url") ??
    metaContent(html, "og:image") ??
    firstMatch(html, [/"display_url":"([^"]+)"/]);

  const videoFormats: FormatOption[] = [];
  const imageFormats: FormatOption[] = [];

  if (videoUrl) {
    videoFormats.push(
      webFormat("v", 0, videoUrl, ar.bestQuality, extFromUrl(videoUrl, "mp4"), {
        hasAudio: true,
      })
    );
  }
  if (imageUrl && imageUrl !== videoUrl) {
    imageFormats.push(
      webFormat("img", 0, imageUrl, ar.original, extFromUrl(imageUrl, "jpg"))
    );
  }

  if (videoFormats.length === 0 && imageFormats.length === 0) return null;

  return {
    title,
    thumbnail,
    platform: "إنستغرام",
    videoFormats,
    audioFormats: [],
    imageFormats,
  };
}

function extractTikTok(html: string): ExtractedMedia | null {
  const title =
    metaContent(html, "og:title") ??
    firstMatch(html, [/"desc":"([^"]{1,200})"/]) ??
    ar.untitled;
  const thumbnail = metaContent(html, "og:image") ?? undefined;

  const videoUrl = firstMatch(html, [
    /"playAddr":"([^"]+)"/,
    /"downloadAddr":"([^"]+)"/,
    /"playApi":"([^"]+)"/,
    /"contentUrl":"(https:[^"]+\.mp4[^"]*)"/,
  ]);

  if (!videoUrl) return null;

  return {
    title,
    thumbnail,
    platform: "تيك توك",
    videoFormats: [
      webFormat("v", 0, videoUrl, ar.bestQuality, extFromUrl(videoUrl, "mp4"), {
        hasAudio: true,
      }),
    ],
    audioFormats: [],
    imageFormats: [],
  };
}

function extractTwitter(html: string): ExtractedMedia | null {
  const title = metaContent(html, "og:title") ?? ar.untitled;
  const thumbnail = metaContent(html, "og:image") ?? undefined;

  const videoUrl =
    metaContent(html, "og:video:url") ??
    metaContent(html, "og:video:secure_url") ??
    metaContent(html, "og:video");

  const imageUrl = metaContent(html, "og:image");

  const videoFormats: FormatOption[] = [];
  const imageFormats: FormatOption[] = [];

  if (videoUrl) {
    videoFormats.push(
      webFormat("v", 0, videoUrl, ar.bestQuality, extFromUrl(videoUrl, "mp4"), {
        hasAudio: true,
      })
    );
  } else if (imageUrl) {
    imageFormats.push(
      webFormat("img", 0, imageUrl, ar.original, extFromUrl(imageUrl, "jpg"))
    );
  }

  if (videoFormats.length === 0 && imageFormats.length === 0) return null;

  return {
    title,
    thumbnail,
    platform: "إكس",
    videoFormats,
    audioFormats: [],
    imageFormats,
  };
}

function extractFacebook(html: string): ExtractedMedia | null {
  const title = metaContent(html, "og:title") ?? ar.untitled;
  const thumbnail = metaContent(html, "og:image") ?? undefined;

  const videoUrl =
    metaContent(html, "og:video:url") ??
    metaContent(html, "og:video:secure_url") ??
    metaContent(html, "og:video") ??
    firstMatch(html, [/hd_src:"([^"]+)"/, /sd_src:"([^"]+)"/, /"playable_url":"([^"]+)"/]);

  const imageUrl = metaContent(html, "og:image");

  const videoFormats: FormatOption[] = [];
  const imageFormats: FormatOption[] = [];

  if (videoUrl) {
    const label = videoUrl.includes("hd") ? "HD" : ar.bestQuality;
    videoFormats.push(
      webFormat("v", 0, videoUrl, label, extFromUrl(videoUrl, "mp4"), { hasAudio: true })
    );
  } else if (imageUrl) {
    imageFormats.push(
      webFormat("img", 0, imageUrl, ar.original, extFromUrl(imageUrl, "jpg"))
    );
  }

  if (videoFormats.length === 0 && imageFormats.length === 0) return null;

  return {
    title,
    thumbnail,
    platform: "فيسبوك",
    videoFormats,
    audioFormats: [],
    imageFormats,
  };
}

export function extractMediaFromHtml(
  html: string,
  platform: ClientPlatform,
  url: string
): ExtractedMedia | null {
  switch (platform) {
    case "instagram":
      return extractInstagram(html) ?? extractOpenGraph(html);
    case "tiktok":
      return extractTikTok(html) ?? extractOpenGraph(html);
    case "twitter":
      return extractTwitter(html) ?? extractOpenGraph(html);
    case "facebook":
      return extractFacebook(html) ?? extractOpenGraph(html);
    case "pinterest":
    case "generic":
      return extractOpenGraph(html);
  }
}
