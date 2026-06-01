import { sanitizeFilename } from "./validate";

export interface DownloadProgressState {
  loaded: number;
  total: number | null;
  percent: number | null;
}

function parseContentLength(header: string | null): number | null {
  if (!header) return null;
  const n = parseInt(header, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function downloadWithProgress(
  url: string,
  options: {
    expectedSize?: number;
    signal?: AbortSignal;
    onProgress: (state: DownloadProgressState) => void;
  }
): Promise<Blob> {
  const res = await fetch(url, { signal: options.signal });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Download failed");
  }

  const total =
    parseContentLength(res.headers.get("Content-Length")) ??
    (options.expectedSize && options.expectedSize > 0 ? options.expectedSize : null);

  if (!res.body) {
    const blob = await res.blob();
    options.onProgress({ loaded: blob.size, total: blob.size, percent: 100 });
    return blob;
  }

  const reader = res.body.getReader();
  const chunks: BlobPart[] = [];
  let loaded = 0;

  options.onProgress({ loaded: 0, total, percent: total ? 0 : null });

  try {
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
        const percent = total ? Math.min(99, Math.round((loaded / total) * 100)) : null;
        options.onProgress({ loaded, total, percent });
      }
    }
  } catch (err) {
    await reader.cancel().catch(() => {});
    throw err;
  }

  const blob = new Blob(chunks);
  options.onProgress({ loaded: blob.size, total: total ?? blob.size, percent: 100 });
  return blob;
}

export function saveBlobAsFile(blob: Blob, title: string, ext: string): void {
  const filename = `${sanitizeFilename(title)}.${ext}`;
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(blobUrl);
}
