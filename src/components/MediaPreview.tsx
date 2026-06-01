"use client";

import { ar } from "@/lib/ar";
import { isDirectImageUrl } from "@/lib/image-url";
import type { MediaInfo } from "@/lib/types";

interface MediaPreviewProps {
  info: MediaInfo;
}

export function MediaPreview({ info }: MediaPreviewProps) {
  return (
    <div className="flex gap-5">
      {info.thumbnail && isDirectImageUrl(info.thumbnail) ? (
        <div className="h-[88px] w-[88px] shrink-0 overflow-hidden rounded-[var(--radius-lg)] bg-[var(--bg-secondary)] ring-1 ring-[var(--border)] sm:h-[100px] sm:w-[100px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={info.thumbnail} alt="" className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className="flex h-[88px] w-[88px] shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--bg-secondary)] text-[12px] font-light text-[var(--text-tertiary)] sm:h-[100px] sm:w-[100px]">
          {ar.noPreview}
        </div>
      )}
      <div className="min-w-0 flex-1 text-right">
        <p className="text-[12px] font-medium text-[var(--text-tertiary)]">{info.platform}</p>
        <h2 className="mt-1 line-clamp-2 text-[19px] font-semibold leading-snug tracking-tight text-[var(--text)]">
          {info.title}
        </h2>
        {(info.uploader || info.durationLabel !== "—") && (
          <p className="mt-1.5 text-[14px] font-light text-[var(--text-secondary)]">
            {[info.uploader, info.durationLabel !== "—" ? info.durationLabel : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}
