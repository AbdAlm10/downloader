import { randomUUID } from "crypto";
import { createWriteStream } from "fs";
import { unlink } from "fs/promises";
import os from "os";
import path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { ar } from "@/lib/ar";
import { guardRequest, parseJsonBody } from "@/lib/api/guard";
import { apiErrorMessage, jsonApiError } from "@/lib/api/responses";
import { createDownloadSession } from "@/lib/download-session";
import { createInnertubeDownloadStream, resolveInnertubePlayableUrl } from "@/lib/youtube-innertube";
import { fetchDirectUrl } from "@/lib/ytdlp";
import { downloadPrepareSchema } from "@/lib/validate";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

async function writeInnertubeToFile(
  url: string,
  formatId: string,
  tmpPath: string
): Promise<void> {
  const direct = await resolveInnertubePlayableUrl(url, formatId);
  if (direct) {
    await writeDirectUrlToFile(direct, tmpPath);
    return;
  }
  const stream = await createInnertubeDownloadStream(url, formatId);
  await pipeline(stream, createWriteStream(tmpPath));
}

async function writeDirectUrlToFile(directUrl: string, tmpPath: string): Promise<void> {
  const { body } = await fetchDirectUrl(directUrl);
  await pipeline(
    Readable.fromWeb(body as import("stream/web").ReadableStream<Uint8Array>),
    createWriteStream(tmpPath)
  );
}

/** Pre-download YouTube via InnerTube to disk — reliable on Render/mobile. */
export async function POST(request: Request) {
  const limited = guardRequest(request, "download");
  if (limited) return limited;

  try {
    const body = await parseJsonBody(request);
    const parsed = downloadPrepareSchema.safeParse(body);

    if (!parsed.success) {
      return jsonApiError(parsed.error.issues[0]?.message ?? ar.invalidParams, 400);
    }

    const { url, formatId, title, ext, merge, directUrl } = parsed.data;
    if (!formatId.startsWith("inn-") && !formatId.startsWith("piped-")) {
      return jsonApiError(ar.formatIdInvalid, 400);
    }

    const fileExt = ext ?? "mp4";
    const tmpPath = path.join(os.tmpdir(), `yt-${randomUUID()}.${fileExt}`);

    try {
      if (formatId.startsWith("inn-")) {
        await writeInnertubeToFile(url, formatId, tmpPath);
      } else if (formatId.startsWith("piped-") && directUrl) {
        await writeDirectUrlToFile(directUrl, tmpPath);
      } else {
        throw new Error(ar.downloadFailed);
      }
    } catch (err) {
      await unlink(tmpPath).catch(() => {});
      throw err;
    }

    const token = createDownloadSession({
      url,
      formatId,
      merge: merge ?? false,
      title: title ?? ar.defaultFilename,
      ext: fileExt,
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
