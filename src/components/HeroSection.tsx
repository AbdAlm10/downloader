import { ar } from "@/lib/ar";

export function HeroSection() {
  return (
    <div className="text-center">
      <h1 className="text-[48px] font-black leading-[1.05] tracking-tight sm:text-[64px]">
        <span className="text-gradient-hero-animated">{ar.heroTitle}</span>
      </h1>
      <p className="mt-1 text-[28px] font-bold leading-tight text-[var(--text)] sm:text-[36px]">
        {ar.heroLine2}
      </p>
      <p className="mx-auto mt-4 max-w-[400px] text-[15px] font-regular leading-snug text-[var(--text-secondary)] sm:text-[17px]">
        {ar.heroSub}
      </p>
      <p className="mt-2 text-[13px] font-medium text-[var(--text-tertiary)]">{ar.appTagline}</p>
    </div>
  );
}
