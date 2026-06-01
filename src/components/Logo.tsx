import { ar } from "@/lib/ar";
import { cn } from "@/lib/utils";

interface LogoProps {
  size?: "sm" | "md";
  className?: string;
}

export function Logo({ size = "sm", className }: LogoProps) {
  const iconSize = size === "sm" ? 28 : 36;

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
        className="shrink-0"
      >
        <rect width="32" height="32" rx="7.2" fill="#007AFF" />
        <path
          d="M16 8v11M16 19l-4-4M16 19l4-4"
          stroke="white"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M10 22h12"
          stroke="white"
          strokeWidth="2.25"
          strokeLinecap="round"
          opacity="0.9"
        />
      </svg>
      <span
        className={cn(
          "font-bold tracking-tight text-[var(--text)]",
          size === "sm" ? "text-[15px]" : "text-[17px]"
        )}
      >
        {ar.appName}
      </span>
    </div>
  );
}
