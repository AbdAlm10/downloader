import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const staticOnly = process.env.NEXT_PUBLIC_STATIC_ONLY !== "false";

const nextConfig: NextConfig = {
  ...(staticOnly ? { output: "export" as const } : {}),
  images: { unoptimized: true },
  serverExternalPackages: ["yt-dlp-wrap"],
  poweredByHeader: false,
  transpilePackages: ["youtubei.js"],
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
});
