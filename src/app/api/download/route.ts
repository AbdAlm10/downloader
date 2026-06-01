import { NextRequest, NextResponse } from "next/server";
import { ar } from "@/lib/ar";
import { guardRequest } from "@/lib/api/guard";
import { apiErrorMessage, jsonError } from "@/lib/api/responses";
import { mimeForImageExt } from "@/lib/mime";
import { nodeStreamToWeb } from "@/lib/stream";
import { isDirectImageUrl } from "@/lib/image-url";
import { assertPublicHttpUrl } from "@/lib/security/url";
import { createDownloadStream, fetchDirectUrl, mimeForMediaExt } from "@/lib/ytdlp";
import { downloadQuerySchema, sanitizeFilename } from "@/lib/validate";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const DOWNLOAD_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

export async function GET(request: NextRequest) {
  const limited = guardRequest(request, "download");
  if (limited) return limited;

  const parsed = downloadQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams)
  );

  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? ar.invalidParams, 400);
  }

  const { url, formatId, directUrl, title, ext, merge } = parsed.data;
  const filename = `${sanitizeFilename(title ?? ar.defaultFilename)}.${ext ?? "mp4"}`;
  const disposition = `attachment; filename="${encodeURIComponent(filename)}"`;

  try {
    if (directUrl || formatId.startsWith("img-") || formatId.startsWith("inv-")) {
      const streamUrl = directUrl ?? "";
      if (!streamUrl) {
        return jsonError(ar.missingImageUrl, 400);
      }

      assertPublicHttpUrl(streamUrl);
      const isImage =
        formatId.startsWith("img-") ||
        isDirectImageUrl(streamUrl) ||
        /^(jpe?g|png|webp|gif|avif|bmp)$/i.test(ext ?? "");
      if (!isImage && !formatId.startsWith("inv-")) {
        return jsonError(ar.notDirectImage, 400);
      }
      const { body, contentType } = await fetchDirectUrl(streamUrl);
      const mime = isImage
        ? mimeForImageExt(ext ?? "jpg", contentType)
        : mimeForMediaExt(ext ?? "mp4", contentType);

      return new NextResponse(body, {
        headers: {
          ...DOWNLOAD_HEADERS,
          "Content-Type": mime,
          "Content-Disposition": disposition,
        },
      });
    }

    if (!url) {
      return jsonError(ar.missingMediaUrl, 400);
    }

    const nodeStream = await createDownloadStream(url, formatId, merge === "true");
    const mediaMime = mimeForMediaExt(ext ?? "mp4", "application/octet-stream");

    return new NextResponse(nodeStreamToWeb(nodeStream), {
      headers: {
        ...DOWNLOAD_HEADERS,
        "Content-Type": mediaMime,
        "Content-Disposition": disposition,
      },
    });
  } catch (err) {
    return jsonError(apiErrorMessage(err, ar.downloadFailed), 500);
  }
}
