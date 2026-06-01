import { ar } from "@/lib/ar";
import { site } from "@/lib/site";

export function AppFooter() {
  return (
    <footer className="shrink-0 pb-3 pt-2 text-center">
      <p className="text-[11px] font-medium tabular-nums text-[var(--text-tertiary)]" dir="ltr">
        v{ar.version}
      </p>
      <p className="text-[10px] py-1 font-light text-[var(--text-tertiary)]">
        {ar.madeWithLove}{" "}
        <a
          href={site.instagram}
          target="_blank"
          rel="noopener noreferrer"
          title={ar.authorInstagram}
          className="font-medium text-[var(--text-secondary)] underline-offset-2 transition hover:text-[var(--text)] hover:underline"
        >
          {ar.author}
        </a>
      </p>
      <p className="text-[10px] font-light text-[var(--text-tertiary)]">{ar.footer}</p>
    </footer>
  );
}
