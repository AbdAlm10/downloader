/** هل الرابط يشير مباشرة إلى ملف صورة (وليس صفحة فيسبوك/منصة)؟ */
export function isDirectImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const path = u.pathname.toLowerCase();
    const href = url.toLowerCase();

    if (u.protocol !== "http:" && u.protocol !== "https:") return false;

    const pageLike = [
      /facebook\.com\/(share|watch|reel|posts|videos|photo\.php|story\.php)/,
      /fb\.watch\//,
      /instagram\.com\/(p|reel|tv|stories)\//,
      /tiktok\.com\/@[^/]+\/video/,
      /twitter\.com\//,
      /x\.com\//,
    ];
    if (pageLike.some((re) => re.test(href))) return false;

    if (/\.(jpe?g|png|webp|gif|avif|bmp)(\?|#|$)/i.test(path)) return true;

    const imageHosts = [
      "fbcdn.net",
      "cdninstagram.com",
      "instagram.f",
      "ytimg.com",
      "ggpht.com",
      "twimg.com",
      "pbs.twimg.com",
    ];
    if (imageHosts.some((h) => host.includes(h))) return true;

    return false;
  } catch {
    return false;
  }
}
