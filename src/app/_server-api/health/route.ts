import { guardRequest } from "@/lib/api/guard";
import { checkBinaryOnDisk, getYtdlpRuntimeStatus } from "@/lib/ytdlp";

export const dynamic = "force-dynamic";

/** فحص سريع — لا يشغّل yt-dlp (يتجنب 502 على Render من فحص الصحة) */
export async function GET(request: Request) {
  const limited = guardRequest(request, "health");
  if (limited) return limited;

  const disk = checkBinaryOnDisk();
  const verbose = process.env.DEPLOY_VERBOSE_ERRORS === "true";

  return Response.json({
    ...disk,
    ...(verbose ? { runtime: getYtdlpRuntimeStatus() } : {}),
  });
}
