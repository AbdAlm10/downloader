import { ar } from "@/lib/ar";
import { guardRequest, parseJsonBody } from "@/lib/api/guard";
import { jsonApiError } from "@/lib/api/responses";
import { resolveInnertubePlayableUrl } from "@/lib/youtube-innertube";
import { infoBodySchema } from "@/lib/validate";
import { z } from "zod";

export const maxDuration = 30;

const resolveBodySchema = infoBodySchema.extend({
  formatId: z.string().min(1).max(64),
});

export async function POST(request: Request) {
  const limited = guardRequest(request, "info");
  if (limited) return limited;

  try {
    const body = await parseJsonBody(request);
    const parsed = resolveBodySchema.safeParse(body);
    if (!parsed.success) {
      return jsonApiError(parsed.error.issues[0]?.message ?? ar.invalidParams, 400);
    }

    const streamUrl = await resolveInnertubePlayableUrl(
      parsed.data.url,
      parsed.data.formatId
    );

    if (!streamUrl) {
      return jsonApiError(ar.downloadFailed, 422);
    }

    return Response.json({ success: true, url: streamUrl });
  } catch {
    return jsonApiError(ar.downloadFailed, 500);
  }
}
