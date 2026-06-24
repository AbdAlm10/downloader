"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ar } from "@/lib/ar";
import { saveBlobAsFile, type DownloadProgressState } from "@/lib/download-client";
import { defaultMediaType, findFormat, formatsForType } from "@/lib/media-helpers";
import { abortSignalWithTimeout, resolveUiError } from "@/lib/client-errors";
import { isYoutubeNavigateError } from "@/lib/youtube-download";
import { isExternalNavigateError } from "@/lib/client-download";
import { isStaticOnly } from "@/lib/static-mode";
import type { MediaInfo, MediaType } from "@/lib/types";
import { TopBar } from "./TopBar";
import { HeroSection } from "./HeroSection";
import { UrlInput } from "./UrlInput";
import { ResultsPanel } from "./ResultsPanel";
import { AppFooter } from "./AppFooter";

function captureClientError(err: unknown) {
  if (process.env.NODE_ENV === "production") {
    import("@sentry/nextjs").then((Sentry) => Sentry.captureException(err));
  }
}

export function DownloaderApp() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [preparingDownload, setPreparingDownload] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgressState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<MediaInfo | null>(null);
  const [mediaType, setMediaType] = useState<MediaType>("video");
  const [selectedFormatId, setSelectedFormatId] = useState<string | null>(null);
  const downloadAbortRef = useRef<AbortController | null>(null);

  const currentFormats = info ? formatsForType(info, mediaType) : [];

  useEffect(() => {
    if (!info) return;
    setSelectedFormatId(formatsForType(info, mediaType)[0]?.id ?? null);
  }, [info, mediaType]);

  const handleAnalyze = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      if (/youtube\.com|youtu\.be/i.test(trimmed)) {
        const { fetchYoutubeOnDevice } = await import("@/lib/youtube-browser");
        const data = await fetchYoutubeOnDevice(trimmed);
        setInfo(data);
        setMediaType(defaultMediaType(data));
        return;
      }

      const { fetchMediaOnDevice } = await import("@/lib/client-media");
      const data = await fetchMediaOnDevice(trimmed, abortSignalWithTimeout(55_000));
      setInfo(data);
      const type = defaultMediaType(data);
      setMediaType(type);
      setSelectedFormatId(formatsForType(data, type)[0]?.id ?? null);
    } catch (err) {
      setError(resolveUiError(err, ar.fetchFailed));
      captureClientError(err);
    } finally {
      setLoading(false);
    }
  }, [url]);

  const handleDownload = useCallback(async () => {
    if (!info || !selectedFormatId) return;

    const format = findFormat(info, selectedFormatId);
    if (!format) return;

    downloadAbortRef.current?.abort();
    const abort = new AbortController();
    downloadAbortRef.current = abort;

    setDownloading(true);
    setPreparingDownload(false);
    setError(null);
    setDownloadProgress({ loaded: 0, total: format.filesize ?? null, percent: 0 });

    const isYoutube =
      /youtube|يوتيوب/i.test(info.platform) && mediaType !== "image";

    try {
      if (isYoutube) {
        setPreparingDownload(true);
        const { downloadYoutubeFormat } = await import("@/lib/youtube-download");
        const blob = await downloadYoutubeFormat(
          info,
          format,
          selectedFormatId,
          mediaType,
          {
            signal: abort.signal,
            onProgress: setDownloadProgress,
          }
        );
        setPreparingDownload(false);
        saveBlobAsFile(blob, info.title, format.ext);
        return;
      }

      if (!format.directUrl) {
        throw new Error(ar.downloadFailed);
      }

      const { downloadMediaWithFallback } = await import("@/lib/client-download");
      const blob = await downloadMediaWithFallback(format.directUrl, {
        signal: abort.signal,
        onProgress: (loaded, total) =>
          setDownloadProgress({
            loaded,
            total,
            percent: total ? Math.min(99, Math.round((loaded / total) * 100)) : null,
          }),
      });
      saveBlobAsFile(blob, info.title, format.ext);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError(ar.downloadCancelled);
        return;
      }
      if (isYoutubeNavigateError(err) || isExternalNavigateError(err)) {
        setError(err instanceof Error ? err.message : ar.downloadOpenedExternally);
        return;
      }
      setError(
        resolveUiError(
          err,
          mediaType === "image" ? ar.imageDownloadFailed : ar.videoDownloadFailed
        )
      );
      captureClientError(err);
    } finally {
      if (downloadAbortRef.current === abort) downloadAbortRef.current = null;
      setDownloading(false);
      setPreparingDownload(false);
      setDownloadProgress(null);
    }
  }, [info, selectedFormatId, mediaType]);

  const handleCancelDownload = useCallback(() => {
    downloadAbortRef.current?.abort();
  }, []);

  const handleCloseResults = () => {
    if (downloading) return;
    setInfo(null);
    setError(null);
    setDownloadProgress(null);
  };

  const downloadLabel =
    mediaType === "image"
      ? ar.downloadImage
      : mediaType === "audio"
        ? ar.downloadAudio
        : ar.downloadVideo;

  const staticMode = isStaticOnly();

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <TopBar ready={staticMode ? true : null} />

      <main className="relative min-h-0 flex-1 overflow-hidden">
        {!info ? (
          <div className="flex h-full flex-col overflow-hidden px-5">
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
              <div className="w-full max-w-[580px]">
                <HeroSection />
                <div className="mt-6 sm:mt-8">
                  <UrlInput
                    value={url}
                    onChange={setUrl}
                    onSubmit={handleAnalyze}
                    loading={loading}
                    disabled={downloading}
                  />
                </div>

                {staticMode && (
                  <p className="mt-3 text-center text-[12px] font-light text-[var(--text-secondary)]">
                    {ar.staticModeHint}
                  </p>
                )}

                {error && (
                  <p className="mt-3 text-center text-[13px] text-[#bf4800]">{error}</p>
                )}
              </div>
            </div>
            <AppFooter />
          </div>
        ) : (
          <ResultsPanel
            info={info}
            mediaType={mediaType}
            onMediaTypeChange={setMediaType}
            formats={currentFormats}
            selectedFormatId={selectedFormatId}
            onSelectFormat={setSelectedFormatId}
            onDownload={handleDownload}
            onCancelDownload={handleCancelDownload}
            downloading={downloading}
            preparingDownload={preparingDownload}
            downloadProgress={downloadProgress}
            downloadLabel={downloadLabel}
            error={error}
            onClose={handleCloseResults}
          />
        )}
      </main>
    </div>
  );
}
