"use client";

import { ar } from "@/lib/ar";
import { cn } from "@/lib/utils";
import type { FormatOption, MediaType } from "@/lib/types";

interface FormatSelectorProps {
  mediaType: MediaType;
  onMediaTypeChange: (type: MediaType) => void;
  formats: FormatOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  videoCount: number;
  audioCount: number;
  imageCount: number;
}

const TABS: { type: MediaType; label: string; key: "videoCount" | "audioCount" | "imageCount" }[] = [
  { type: "video", label: ar.video, key: "videoCount" },
  { type: "audio", label: ar.audio, key: "audioCount" },
  { type: "image", label: ar.image, key: "imageCount" },
];

export function FormatSelector({
  mediaType,
  onMediaTypeChange,
  formats,
  selectedId,
  onSelect,
  videoCount,
  audioCount,
  imageCount,
}: FormatSelectorProps) {
  const counts = { videoCount, audioCount, imageCount };

  return (
    <div className="mt-8 space-y-4">
      <p className="text-right text-[13px] font-medium text-[var(--text-tertiary)]">{ar.chooseQuality}</p>

      <div className="inline-flex w-full rounded-[var(--radius-pill)] bg-[var(--bg-secondary)] p-1 sm:w-auto">
        {TABS.map(({ type, label, key }) => {
          const n = counts[key];
          const on = mediaType === type;
          return (
            <button
              key={type}
              type="button"
              disabled={n === 0}
              onClick={() => onMediaTypeChange(type)}
              className={cn(
                "flex-1 rounded-[var(--radius-pill)] px-5 py-2 text-[14px] font-medium transition sm:flex-none sm:px-6",
                on
                  ? "bg-[var(--white)] text-[var(--apple-blue)] shadow-[var(--shadow-sm)]"
                  : "text-[var(--text-secondary)]",
                n === 0 && "opacity-25"
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-[var(--radius-lg)] bg-[var(--bg-secondary)]/60 ring-1 ring-[var(--border)]">
        {formats.map((f, i) => {
          const on = selectedId === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onSelect(f.id)}
              className={cn(
                "flex w-full items-center justify-between px-5 py-4 text-right transition",
                i > 0 && "border-t border-[var(--border)]",
                on ? "bg-[var(--white)]" : "hover:bg-[var(--white)]/60"
              )}
            >
              <span className="text-[15px] font-semibold text-[var(--text)] ltr-nums">{f.quality}</span>
              <span className="text-[13px] font-light text-[var(--text-tertiary)] ltr-nums">
                {f.ext.toUpperCase()}
                {f.filesizeLabel && ` · ${f.filesizeLabel}`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
