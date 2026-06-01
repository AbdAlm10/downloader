import { SiGithub } from "react-icons/si";
import { ar } from "@/lib/ar";
import { site } from "@/lib/site";
import { Logo } from "./Logo";

export function TopBar({ ready }: { ready: boolean | null }) {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[rgba(255,255,255,0.72)] backdrop-blur-2xl backdrop-saturate-150">
      <div className="mx-auto flex h-[52px] max-w-[680px] items-center justify-between px-6">
        <Logo size="sm" />

        <div className="flex items-center gap-2">
          <a
            href={site.github}
            target="_blank"
            rel="noopener noreferrer"
            title={ar.githubStar}
            aria-label={ar.githubStar}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#24292f] transition hover:bg-[var(--apple-gray-6)] hover:text-[#000]"
          >
            <SiGithub className="h-[22px] w-[22px]" aria-hidden />
          </a>

          {ready !== null && (
            <div className="flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--apple-gray-6)] px-3 py-1">
              <span
                className={`h-[6px] w-[6px] rounded-full ${
                  ready ? "bg-[var(--apple-green)]" : "animate-pulse bg-[var(--apple-orange)]"
                }`}
              />
              <span className="text-[12px] font-medium text-[var(--text-secondary)]">
                {ready ? ar.ready : ar.engineLoading}
              </span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
