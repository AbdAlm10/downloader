export const IMAGE_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  bmp: "image/bmp",
};

export const ALLOWED_EXTENSIONS = new Set([
  "mp4",
  "webm",
  "mkv",
  "mov",
  "mp3",
  "m4a",
  "opus",
  "ogg",
  "wav",
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "avif",
  "bmp",
]);

export function mimeForImageExt(ext: string, fallback: string): string {
  return IMAGE_MIME[ext.toLowerCase()] ?? fallback;
}
