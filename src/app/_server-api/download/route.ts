import { NextRequest, NextResponse } from "next/server";
import { ar } from "@/lib/ar";
import { guardRequest } from "@/lib/api/guard";
import { apiErrorMessage, jsonError } from "@/lib/api/responses";
import { mimeForImageExt } from "@/lib/mime";
import { nodeStreamToWeb } from "@/lib/stream";
import { isDirectImageUrl } from "@/lib/image-url";
import { assertPublicHttpUrl } from "@/lib/security/url";
import { consumeDownloadSession } from "@/lib/download-session";
import { createDownloadStream, fetchDirectUrl, mimeForMediaExt } from "@/lib/ytdlp";
import { resolveInnertubePlayableUrl } from "@/lib/youtube-innertube";
import { resolveYoutubeStreamUrl } from "@/lib/youtube-innertube-direct";
import { extractYouTubeVideoId } from "@/lib/youtube-piped";
import { downloadQuerySchema, sanitizeFilename } from "@/lib/validate";
import { createReadStream, statSync, unlink } from "fs";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const DOWNLOAD_HEADERS = {
  "Cache-Control": "no-store, no-transform",
  "X-Content-Type-Options": "nosniff",
  "X-Accel-Buffering": "no",
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

  const { token, url, formatId, directUrl, title, ext, merge } = parsed.data;
  const filename = `${sanitizeFilename(title ?? ar.defaultFilename)}.${ext ?? "mp4"}`;
  const disposition = `attachment; filename="${encodeURIComponent(filename)}"`;

  try {
    if (token) {
      const session = consumeDownloadSession(token);
      if (!session) {
        return jsonError(ar.downloadExpired, 410);
      }

      const stat = statSync(session.tmpPath);
      const stream = createReadStream(session.tmpPath);
      stream.on("close", () => unlink(session.tmpPath, () => {}));

      const sessionFilename = `${sanitizeFilename(session.title)}.${session.ext}`;
      const mediaMime = mimeForMediaExt(session.ext, "application/octet-stream");
      return new NextResponse(nodeStreamToWeb(stream), {
        headers: {
          ...DOWNLOAD_HEADERS,
          "Content-Type": mediaMime,
          "Content-Disposition": `attachment; filename="${encodeURIComponent(sessionFilename)}"`,
          "Content-Length": String(stat.size),
        },
      });
    }

    if (!formatId) {
      return jsonError(ar.formatIdInvalid, 400);
    }

    if (!token && url && formatId.startsWith("inn-")) {
      const playable = await resolveInnertubePlayableUrl(url, formatId);
      if (playable) {
        const { body, contentType } = await fetchDirectUrl(playable);
        const mediaMime = mimeForMediaExt(ext ?? "mp4", contentType);
        return new NextResponse(body, {
          headers: {
            ...DOWNLOAD_HEADERS,
            "Content-Type": mediaMime,
            "Content-Disposition": disposition,
          },
        });
      }

      const nodeStream = createDownloadStream(url, formatId, merge === "true");
      const mediaMime = mimeForMediaExt(ext ?? "mp4", "application/octet-stream");
      return new NextResponse(nodeStreamToWeb(nodeStream), {
        headers: {
          ...DOWNLOAD_HEADERS,
          "Content-Type": mediaMime,
          "Content-Disposition": disposition,
        },
      });
    }

    if (directUrl || formatId.startsWith("img-") || formatId.startsWith("inv-")) {
      let streamUrl = directUrl ?? "";

      if (
        !streamUrl &&
        formatId.startsWith("inn-") &&
        url
      ) {
        const videoId = extractYouTubeVideoId(url);
        if (videoId) {
          streamUrl = (await resolveYoutubeStreamUrl(videoId, formatId)) ?? "";
        }
      }

      if (!streamUrl) {
        return jsonError(ar.missingImageUrl, 400);
      }

      assertPublicHttpUrl(streamUrl);
      const isAltVideo =
        formatId.startsWith("piped-") ||
        formatId.startsWith("inn-") ||
        /googlevideo\.com|gvt1\.com|videoplayback/i.test(streamUrl);
      const isImage =
        formatId.startsWith("img-") ||
        isDirectImageUrl(streamUrl) ||
        /^(jpe?g|png|webp|gif|avif|bmp)$/i.test(ext ?? "");
      if (!isImage && !isAltVideo) {
        return jsonError(ar.notDirectImage, 400);
      }
      const { body, contentType } = await fetchDirectUrl(streamUrl);
      const mime =
        isImage && !isAltVideo
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

    const nodeStream = createDownloadStream(url, formatId, merge === "true");
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
