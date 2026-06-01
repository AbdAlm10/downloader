"use client";

import { X } from "lucide-react";
import { ar } from "@/lib/ar";
import { MediaPreview } from "./MediaPreview";
import { FormatSelector } from "./FormatSelector";
import { DownloadButton } from "./DownloadButton";
import { DownloadProgress } from "./DownloadProgress";
import type { DownloadProgressState } from "@/lib/download-client";
import type { FormatOption, MediaInfo, MediaType } from "@/lib/types";

interface ResultsPanelProps {
  info: MediaInfo;
  mediaType: MediaType;
  onMediaTypeChange: (type: MediaType) => void;
  formats: FormatOption[];
  selectedFormatId: string | null;
  onSelectFormat: (id: string) => void;
  onDownload: () => void;
  onCancelDownload: () => void;
  downloading: boolean;
  downloadProgress: DownloadProgressState | null;
  downloadLabel: string;
  error: string | null;
  onClose: () => void;
}

export function ResultsPanel({
  info,
  mediaType,
  onMediaTypeChange,
  formats,
  selectedFormatId,
  onSelectFormat,
  onDownload,
  onCancelDownload,
  downloading,
  downloadProgress,
  downloadLabel,
  error,
  onClose,
}: ResultsPanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--white)] animate-fade-up">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-5 py-3">
        <button
          type="button"
          onClick={onClose}
          disabled={downloading}
          className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-secondary)] transition hover:bg-[var(--apple-gray-6)] disabled:opacity-40"
          aria-label="إغلاق"
        >
          <X className="h-5 w-5" />
        </button>
        <h2 className="text-[17px] font-semibold text-[var(--text)]">{ar.result}</h2>
        <div className="w-9" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
        <div className="mx-auto max-w-[520px]">
          <MediaPreview info={info} />
          <FormatSelector
            mediaType={mediaType}
            onMediaTypeChange={onMediaTypeChange}
            formats={formats}
            selectedId={selectedFormatId}
            onSelect={onSelectFormat}
            videoCount={info.videoFormats.length}
            audioCount={info.audioFormats.length}
            imageCount={info.imageFormats.length}
          />
          {error && (
            <p className="mt-4 text-center text-[14px] text-[#bf4800]">{error}</p>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-[var(--border)] bg-[var(--white)] px-5 py-4">
        <div className="mx-auto max-w-[520px] space-y-3">
          {downloading && downloadProgress && (
            <DownloadProgress progress={downloadProgress} onCancel={onCancelDownload} />
          )}
          <DownloadButton
            onClick={onDownload}
            loading={downloading}
            disabled={!selectedFormatId || formats.length === 0}
            label={downloadLabel}
          />
        </div>
      </div>
    </div>
  );
}
