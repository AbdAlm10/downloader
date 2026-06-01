"use client";

import { Loader2 } from "lucide-react";
import { ar } from "@/lib/ar";
import { cn } from "@/lib/utils";

interface DownloadButtonProps {
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  label?: string;
  className?: string;
}

export function DownloadButton({
  onClick,
  loading,
  disabled,
  label = ar.downloadVideo,
  className,
}: DownloadButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "flex h-[52px] w-full items-center justify-center rounded-[var(--radius-pill)]",
        className,
        "bg-[var(--text)] text-[17px] font-semibold text-[var(--white)]",
        "shadow-[var(--shadow-md)] transition hover:opacity-90 active:scale-[0.98]",
        "disabled:cursor-default disabled:bg-[var(--bg-secondary)] disabled:text-[var(--text-tertiary)] disabled:shadow-none"
      )}
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : label}
    </button>
  );
}
