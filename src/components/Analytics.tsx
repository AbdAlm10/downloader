import Script from "next/script";

const umamiId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
const umamiSrc =
  process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL ?? "https://cloud.umami.is/script.js";

export function Analytics() {
  if (!umamiId) return null;

  return (
    <Script
      defer
      src={umamiSrc}
      data-website-id={umamiId}
      strategy="afterInteractive"
    />
  );
}
