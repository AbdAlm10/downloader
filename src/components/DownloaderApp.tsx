"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ar } from "@/lib/ar";
import {
  downloadWithProgress,
  saveBlobAsFile,
  type DownloadProgressState,
} from "@/lib/download-client";
import {
  buildDownloadParams,
  defaultMediaType,
  findFormat,
  formatsForType,
} from "@/lib/media-helpers";
import { isYoutubePresetFormatId } from "@/lib/youtube-formats";
import { usesAltYoutubeDownload } from "@/lib/youtube";
import type { ApiResponse, MediaInfo, MediaType } from "@/lib/types";
import { TopBar } from "./TopBar";
import { HeroSection } from "./HeroSection";
import { UrlInput } from "./UrlInput";
import { ResultsPanel } from "./ResultsPanel";
import { AppFooter } from "./AppFooter";
import { useFailover } from "@/hooks/useFailover";

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
  const [engineReady, setEngineReady] = useState<boolean | null>(null);
  const downloadAbortRef = useRef<AbortController | null>(null);

  useFailover();

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch("/api/health", {
          cache: "no-store",
          signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok) {
          if (!cancelled) setEngineReady(false);
          return;
        }
        const d: { ready?: boolean } = await res.json();
        if (!cancelled) setEngineReady(d.ready === true);
      } catch {
        if (!cancelled) setEngineReady(false);
      }
    };

    check();
    const id = window.setInterval(check, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

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
      const res = await fetch("/api/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
        signal: AbortSignal.timeout(50_000),
      });
      const data: ApiResponse = await res.json();

      if (!data.success) {
        setError(data.error);
        return;
      }

      setInfo(data.data);
      const type = defaultMediaType(data.data);
      setMediaType(type);
      setSelectedFormatId(formatsForType(data.data, type)[0]?.id ?? null);
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        setError(ar.fetchTimeout);
      } else {
        setError(ar.networkError);
      }
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

    try {
      const usePrepare =
        /youtube|يوتيوب/i.test(info.platform) &&
        mediaType !== "image" &&
        !format.directUrl &&
        !usesAltYoutubeDownload(selectedFormatId, format.directUrl);

      let downloadUrl: string;

      if (usePrepare) {
        setPreparingDownload(true);
        const merge =
          mediaType === "video" &&
          (isYoutubePresetFormatId(selectedFormatId) ||
            !format.hasAudio ||
            selectedFormatId.includes("+"));

        const prepRes = await fetch("/api/download/prepare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: info.webpageUrl,
            formatId: selectedFormatId,
            title: info.title,
            ext: format.ext,
            merge,
          }),
          signal: abort.signal,
        });
        const prepData = (await prepRes.json()) as {
          success?: boolean;
          token?: string;
          error?: string;
        };
        setPreparingDownload(false);

        if (!prepRes.ok || !prepData.success || !prepData.token) {
          throw new Error(prepData.error ?? ar.downloadFailed);
        }

        const tokenParams = new URLSearchParams({
          token: prepData.token,
          title: info.title,
          ext: format.ext,
        });
        downloadUrl = `/api/download?${tokenParams}`;
      } else {
        downloadUrl = `/api/download?${buildDownloadParams(info, format, selectedFormatId, mediaType)}`;
      }

      const blob = await downloadWithProgress(downloadUrl, {
        expectedSize: format.filesize,
        signal: abort.signal,
        onProgress: setDownloadProgress,
      });

      saveBlobAsFile(blob, info.title, format.ext);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError(ar.downloadCancelled);
        return;
      }
      setError(
        err instanceof Error
          ? err.message
          : mediaType === "image"
            ? ar.imageDownloadFailed
            : ar.videoDownloadFailed
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

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <TopBar ready={engineReady} />

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

                {engineReady === false && (
                  <p className="mt-3 text-center text-[12px] font-light text-[var(--text-secondary)]">
                    {ar.engineNotReady}
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
