const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** يحوّل روابط share القصيرة إلى الرابط النهائي إن أمكن */
export async function resolveMediaUrl(url: string): Promise<string> {
  const needsResolve = /facebook\.com\/share\/|fb\.watch\/|instagram\.com\/share\//i.test(url);
  if (!needsResolve) return url;

  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(15_000),
    });
    const final = res.url;
    if (final && final.startsWith("http") && final !== url) return final;
  } catch {
    /* استخدم الرابط الأصلي */
  }

  return url;
}
