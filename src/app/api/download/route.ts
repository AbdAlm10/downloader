import { NextRequest, NextResponse } from "next/server";
import { ar } from "@/lib/ar";
import { guardRequest } from "@/lib/api/guard";
import { apiErrorMessage, jsonError } from "@/lib/api/responses";
import { mimeForImageExt } from "@/lib/mime";
import { nodeStreamToWeb } from "@/lib/stream";
import { assertPublicHttpUrl } from "@/lib/security/url";
import { createDownloadStream, fetchDirectUrl } from "@/lib/ytdlp";
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
    if (directUrl || formatId.startsWith("img-")) {
      const imageUrl = directUrl ?? "";
      if (!imageUrl) {
        return jsonError(ar.missingImageUrl, 400);
      }

      assertPublicHttpUrl(imageUrl);
      const { body, contentType } = await fetchDirectUrl(imageUrl);
      const mime = mimeForImageExt(ext ?? "jpg", contentType);

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

    return new NextResponse(nodeStreamToWeb(nodeStream), {
      headers: {
        ...DOWNLOAD_HEADERS,
        "Content-Type": "application/octet-stream",
        "Content-Disposition": disposition,
      },
    });
  } catch (err) {
    return jsonError(apiErrorMessage(err, ar.downloadFailed), 500);
  }
}
