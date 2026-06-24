/** Normalize any YouTube URL and extract the 11-character video id. */
export function extractYouTubeVideoId(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const u = new URL(trimmed);
    const host = u.hostname.replace(/^www\.|^m\.|^music\./i, "").toLowerCase();

    if (host === "youtu.be") {
      const id = u.pathname.replace(/^\//, "").split("/")[0];
      return isValidVideoId(id) ? id : null;
    }

    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      const v = u.searchParams.get("v");
      if (v && isValidVideoId(v)) return v;

      const pathPatterns = [
        /^\/shorts\/([\w-]{11})/,
        /^\/embed\/([\w-]{11})/,
        /^\/live\/([\w-]{11})/,
        /^\/v\/([\w-]{11})/,
        /^\/watch\/([\w-]{11})/,
      ];
      for (const re of pathPatterns) {
        const m = u.pathname.match(re);
        if (m?.[1] && isValidVideoId(m[1])) return m[1];
      }
    }
  } catch {
    /* fall through */
  }

  const loose = trimmed.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/|v\/))([\w-]{11})/
  );
  return loose?.[1] && isValidVideoId(loose[1]) ? loose[1] : null;
}

function isValidVideoId(id: string | undefined | null): id is string {
  return Boolean(id && /^[\w-]{11}$/.test(id));
}

export function normalizeYoutubeWatchUrl(url: string): string | null {
  const id = extractYouTubeVideoId(url);
  if (!id) return null;
  return `https://www.youtube.com/watch?v=${id}`;
}

export function isYoutubeUrl(url: string): boolean {
  return extractYouTubeVideoId(url) !== null;
}
