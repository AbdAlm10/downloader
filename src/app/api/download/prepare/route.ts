import { ar } from "@/lib/ar";
import { guardRequest, parseJsonBody } from "@/lib/api/guard";
import { apiErrorMessage, jsonApiError } from "@/lib/api/responses";
import { createDownloadSession } from "@/lib/download-session";
import { downloadToTempFile } from "@/lib/ytdlp";
import { isBlockedYoutubeYtdlpFormat, isYoutubeUrl } from "@/lib/youtube";
import { downloadPrepareSchema } from "@/lib/validate";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Pre-download to disk so GET /api/download?token= responds instantly (Render 502 fix). */
export async function POST(request: Request) {
  const limited = guardRequest(request, "download");
  if (limited) return limited;

  try {
    const body = await parseJsonBody(request);
    const parsed = downloadPrepareSchema.safeParse(body);

    if (!parsed.success) {
      return jsonApiError(parsed.error.issues[0]?.message ?? ar.invalidParams, 400);
    }

    const { url, formatId, title, ext, merge } = parsed.data;

    if (isYoutubeUrl(url) && isBlockedYoutubeYtdlpFormat(formatId)) {
      return jsonApiError(ar.youtubeEngineMissing, 422);
    }

    const tmpPath = await downloadToTempFile(url, formatId, merge ?? false);
    const token = createDownloadSession({
      url,
      formatId,
      merge: merge ?? false,
      title: title ?? ar.defaultFilename,
      ext: ext ?? "mp4",
      tmpPath,
    });

    return Response.json({ success: true, token });
  } catch (err) {
    if (err instanceof Error && err.message === ar.requestTooLarge) {
      return jsonApiError(ar.requestTooLarge, 413);
    }
    return jsonApiError(apiErrorMessage(err, ar.downloadFailed), 500);
  }
}
