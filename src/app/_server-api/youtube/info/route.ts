import { ar } from "@/lib/ar";
import { guardRequest } from "@/lib/api/guard";
import { jsonApiError } from "@/lib/api/responses";
import { fetchYoutubeViaInnertube } from "@/lib/youtube-innertube";
import { fetchYoutubeViaPiped } from "@/lib/youtube-piped";
import { infoBodySchema } from "@/lib/validate";
import { formatDuration } from "@/lib/utils";
import type { MediaInfo } from "@/lib/types";

export const maxDuration = 45;

/** Server-side YouTube fallback when browser InnerTube fails (e.g. strict network). */
export async function POST(request: Request) {
  const limited = guardRequest(request, "info");
  if (limited) return limited;

  try {
    const body = await request.json();
    const parsed = infoBodySchema.safeParse(body);
    if (!parsed.success) {
      return jsonApiError(parsed.error.issues[0]?.message ?? ar.invalidUrl, 400);
    }

    const url = parsed.data.url;
    if (!/youtube\.com|youtu\.be/i.test(url)) {
      return jsonApiError(ar.unsupportedUrl, 400);
    }

    const innertube = await fetchYoutubeViaInnertube(url);
    const raw = innertube ?? (await fetchYoutubeViaPiped(url));

    if (
      !raw ||
      (raw.videoFormats.length === 0 &&
        raw.audioFormats.length === 0 &&
        raw.imageFormats.length === 0)
    ) {
      return jsonApiError(ar.youtubeEngineMissing, 422);
    }

    const data: MediaInfo = {
      ...raw,
      durationLabel: formatDuration(raw.duration),
      analyzedOnDevice: false,
    };

    return Response.json({ success: true, data });
  } catch {
    return jsonApiError(ar.fetchFailed, 500);
  }
}
