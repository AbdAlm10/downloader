"use client";

import { ar } from "./ar";
import { downloadMediaUrl } from "./cors-proxy";

export class ExternalNavigateDownload extends Error {
  constructor() {
    super(ar.downloadOpenedExternally);
    this.name = "ExternalNavigateDownload";
  }
}

export function isExternalNavigateError(err: unknown): boolean {
  return (
    err instanceof ExternalNavigateDownload ||
    (err instanceof Error && err.name === "ExternalNavigateDownload")
  );
}

/** Download in-browser; open CDN URL when CORS blocks blob fetch. */
export async function downloadMediaWithFallback(
  mediaUrl: string,
  options: {
    signal?: AbortSignal;
    onProgress?: (loaded: number, total: number | null) => void;
  } = {}
): Promise<Blob> {
  try {
    return await downloadMediaUrl(mediaUrl, options);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    if (mediaUrl.startsWith("http")) {
      window.open(mediaUrl, "_blank", "noopener,noreferrer");
      throw new ExternalNavigateDownload();
    }
    throw err;
  }
}
