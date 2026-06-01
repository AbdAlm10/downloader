import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
    const { getYtdlp } = await import("./lib/ytdlp");
    getYtdlp().catch(() => {
      /* يُعاد المحاولة عند أول طلب */
    });
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
