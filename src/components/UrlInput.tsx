"use client";

import { ClipboardPaste, Loader2 } from "lucide-react";
import { ar } from "@/lib/ar";
import { cn } from "@/lib/utils";
import { PlatformIcons } from "./PlatformIcons";

interface UrlInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export function UrlInput({ value, onChange, onSubmit, loading, disabled }: UrlInputProps) {
  const hasUrl = value.trim().length > 0;
  const canSubmit = hasUrl && !disabled && !loading;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && canSubmit) onSubmit();
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) onChange(text.trim());
    } catch {
      /* denied */
    }
  };

  return (
    <div className="mx-auto w-full max-w-[580px]">
      <div
        className={cn(
          "flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--white)] p-1.5",
          "shadow-[var(--shadow-md)] ring-1 ring-[var(--border)]",
          "transition-shadow focus-within:shadow-[var(--shadow-lg)] focus-within:ring-[var(--apple-blue)]/25"
        )}
      >
        <button
          type="button"
          onClick={handlePaste}
          disabled={disabled || loading}
          title={ar.paste}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--apple-blue)] transition hover:bg-[var(--apple-blue-soft)] disabled:opacity-40"
        >
          <ClipboardPaste className="h-[18px] w-[18px]" strokeWidth={2} />
        </button>

        <input
          type="url"
          dir="ltr"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || loading}
          placeholder={ar.pastePlaceholder}
          className="min-w-0 flex-1 bg-transparent px-1 py-3 text-center text-[17px] font-regular text-[var(--text)] outline-none placeholder:text-[var(--text-tertiary)] disabled:opacity-40 sm:text-start"
        />

        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          className={cn(
            "flex h-11 shrink-0 items-center justify-center rounded-[var(--radius-pill)] px-6",
            "text-[15px] font-semibold transition-all duration-200",
            canSubmit
              ? "bg-[var(--apple-blue)] text-white shadow-sm hover:bg-[var(--apple-blue-hover)] active:scale-[0.97]"
              : "bg-[var(--apple-gray-6)] text-[var(--apple-gray)]"
          )}
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : ar.analyze}
        </button>
      </div>

      <PlatformIcons />
    </div>
  );
}
