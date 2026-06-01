"use client";

import { X } from "lucide-react";
import { ar } from "@/lib/ar";
import { formatFileSize } from "@/lib/utils";
import type { DownloadProgressState } from "@/lib/download-client";
import { cn } from "@/lib/utils";

interface DownloadProgressProps {
  progress: DownloadProgressState;
  onCancel: () => void;
  statusLabel?: string;
  className?: string;
}

export function DownloadProgress({
  progress,
  onCancel,
  statusLabel,
  className,
}: DownloadProgressProps) {
  const { loaded, total, percent } = progress;
  const known = percent !== null && total !== null && total > 0;
  const displayPercent = known ? percent : null;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center justify-between gap-2 text-[12px] font-medium">
            <span className="text-[var(--text-secondary)]">
              {statusLabel ?? ar.downloadingProgress}
            </span>
            <span className="shrink-0 tabular-nums text-[var(--text)]" dir="ltr">
              {displayPercent !== null
                ? `${displayPercent}% · ${formatFileSize(loaded)}${total ? ` / ${formatFileSize(total)}` : ""}`
                : `${formatFileSize(loaded)}${total ? ` / ${formatFileSize(total)}` : ""}`}
            </span>
          </div>

          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--apple-gray-6)]">
            {known ? (
              <div
                className="h-full rounded-full bg-[var(--apple-blue)] transition-[width] duration-300 ease-out"
                style={{ width: `${Math.max(2, displayPercent ?? 0)}%` }}
              />
            ) : (
              <div className="relative h-full w-full overflow-hidden rounded-full bg-[var(--apple-gray-6)]">
                <div
                  className="absolute inset-y-0 w-1/3 rounded-full bg-[var(--apple-blue)]"
                  style={{ animation: "progress-indeterminate 1.2s ease-in-out infinite" }}
                />
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onCancel}
          title={ar.cancelDownload}
          aria-label={ar.cancelDownload}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ff3b30] text-white shadow-sm transition hover:bg-[#e6352b] active:scale-95"
        >
          <X className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
