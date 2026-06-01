import { guardRequest } from "@/lib/api/guard";
import { checkYtdlpReady } from "@/lib/ytdlp";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = guardRequest(request, "health");
  if (limited) return limited;

  const { ready } = await checkYtdlpReady();
  return Response.json({ ready });
}
