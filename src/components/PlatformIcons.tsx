"use client";

import {
  SiFacebook,
  SiInstagram,
  SiPinterest,
  SiReddit,
  SiSoundcloud,
  SiTiktok,
  SiX,
  SiYoutube,
} from "react-icons/si";
import { ar } from "@/lib/ar";
import { cn } from "@/lib/utils";

const PLATFORMS = [
  { Icon: SiYoutube, hover: "group-hover:text-[#FF0000]", label: "يوتيوب" },
  { Icon: SiTiktok, hover: "group-hover:text-[#000000]", label: "تيك توك" },
  { Icon: SiInstagram, hover: "group-hover:text-[#E4405F]", label: "إنستغرام" },
  { Icon: SiX, hover: "group-hover:text-[#000000]", label: "إكس" },
  { Icon: SiFacebook, hover: "group-hover:text-[#1877F2]", label: "فيسبوك" },
  { Icon: SiPinterest, hover: "group-hover:text-[#BD081C]", label: "بينتريست" },
  { Icon: SiSoundcloud, hover: "group-hover:text-[#FF5500]", label: "ساوند كلاود" },
  { Icon: SiReddit, hover: "group-hover:text-[#FF4500]", label: "ريديت" },
] as const;

export function PlatformIcons() {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
      <div className="flex flex-wrap items-center justify-center gap-0.5">
        {PLATFORMS.map(({ Icon, hover, label }) => (
          <button
            key={label}
            type="button"
            title={label}
            aria-label={label}
            className={cn(
              "group flex h-8 w-8 items-center justify-center rounded-lg",
              "transition-all duration-200 hover:bg-[var(--apple-blue-soft)] active:scale-95"
            )}
          >
            <Icon
              size={16}
              className={cn("text-[var(--apple-gray)] transition-colors", hover)}
            />
          </button>
        ))}
      </div>
      <span className="text-[12px] font-semibold text-[var(--text-secondary)]">
        {ar.platformsCount}
      </span>
    </div>
  );
}
