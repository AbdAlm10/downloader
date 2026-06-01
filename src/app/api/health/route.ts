import { guardRequest } from "@/lib/api/guard";
import { checkBinaryOnDisk } from "@/lib/ytdlp";

export const dynamic = "force-dynamic";

/** فحص سريع — لا يشغّل yt-dlp (يتجنب 502 على Render من فحص الصحة) */
export async function GET(request: Request) {
  const limited = guardRequest(request, "health");
  if (limited) return limited;

  return Response.json(checkBinaryOnDisk());
}
