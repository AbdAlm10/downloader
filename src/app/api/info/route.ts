import { ar } from "@/lib/ar";
import { guardRequest, parseJsonBody } from "@/lib/api/guard";
import { jsonApiError, safeServerMessage } from "@/lib/api/responses";
import { fetchMediaInfo } from "@/lib/ytdlp";
import { infoBodySchema } from "@/lib/validate";
import { formatDuration } from "@/lib/utils";
import type { MediaInfo } from "@/lib/types";

export const maxDuration = 120;

export async function POST(request: Request) {
  const limited = guardRequest(request, "info");
  if (limited) return limited;

  try {
    const body = await parseJsonBody(request);
    const parsed = infoBodySchema.safeParse(body);

    if (!parsed.success) {
      return jsonApiError(parsed.error.issues[0]?.message ?? ar.invalidUrl, 400);
    }

    const raw = await fetchMediaInfo(parsed.data.url);

    if (
      raw.videoFormats.length === 0 &&
      raw.audioFormats.length === 0 &&
      raw.imageFormats.length === 0
    ) {
      return jsonApiError(ar.noFormats, 422);
    }

    const data: MediaInfo = {
      ...raw,
      durationLabel: formatDuration(raw.duration),
    };

    return Response.json({ success: true, data });
  } catch (err) {
    const message =
      err instanceof Error && err.message === ar.requestTooLarge
        ? ar.requestTooLarge
        : safeServerMessage(err, ar.fetchFailed);
    return jsonApiError(message, 500);
  }
}
