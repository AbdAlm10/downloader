import { fetchYoutubeOnEdge } from "./youtube-info-shared";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS });
  }

  try {
    const body = (await request.json()) as { url?: string };
    const url = body.url?.trim();
    if (!url) {
      return Response.json(
        { success: false, error: "رابط غير صالح" },
        { status: 400, headers: CORS }
      );
    }

    const data = await fetchYoutubeOnEdge(url);
    if (!data) {
      return Response.json(
        {
          success: false,
          error: "تعذّر تحليل يوتيوب. جرّب رابطاً آخر أو انتظر قليلاً ثم أعد التحليل.",
        },
        { status: 422, headers: CORS }
      );
    }

    return Response.json({ success: true, data }, { headers: CORS });
  } catch {
    return Response.json(
      { success: false, error: "تعذّر جلب معلومات الوسائط" },
      { status: 500, headers: CORS }
    );
  }
};

export const config = { path: "/api/youtube/info" };
