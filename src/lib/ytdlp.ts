import YTDlpWrap from "yt-dlp-wrap";
import path from "path";
import fs from "fs";
import { ar } from "./ar";
import { parseMediaInfo, type RawInfo } from "./formats";
import { assertPublicHttpUrl } from "./security/url";

const BIN_DIR = path.join(process.cwd(), ".bin");
const BIN_PATH = path.join(BIN_DIR, process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");

const INFO_ARGS = [
  "-J",
  "--no-playlist",
  "--no-warnings",
  "--ignore-no-formats-error",
  "--retries",
  "3",
  "--socket-timeout",
  "30",
];

let ytdlpInstance: YTDlpWrap | null = null;
let initPromise: Promise<YTDlpWrap> | null = null;

async function ensureBinary(): Promise<string> {
  if (fs.existsSync(BIN_PATH)) return BIN_PATH;

  fs.mkdirSync(BIN_DIR, { recursive: true });
  await YTDlpWrap.downloadFromGithub(BIN_PATH, undefined, process.platform);
  return BIN_PATH;
}

export async function getYtdlp(): Promise<YTDlpWrap> {
  if (ytdlpInstance) return ytdlpInstance;

  if (!initPromise) {
    initPromise = (async () => {
      const binaryPath = await ensureBinary();
      ytdlpInstance = new YTDlpWrap(binaryPath);
      return ytdlpInstance;
    })();
  }

  return initPromise;
}

function extractYtdlpError(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message;
    if (msg.includes("Private video")) return ar.privateVideo;
    if (msg.includes("Sign in") || msg.includes("login")) return ar.loginRequired;
    if (msg.includes("Unsupported URL")) return ar.unsupportedUrl;
    if (msg.includes("Unable to download") || msg.includes("HTTP Error")) return ar.unreachable;
    if (msg.length > 300) return msg.slice(0, 300) + "…";
    return msg;
  }
  return ar.fetchFailed;
}

async function fetchRawInfo(ytdlp: YTDlpWrap, url: string): Promise<RawInfo> {
  try {
    const stdout = await ytdlp.execPromise([url, ...INFO_ARGS]);
    return JSON.parse(stdout) as RawInfo;
  } catch {
    const raw = (await ytdlp.getVideoInfo([url, ...INFO_ARGS])) as RawInfo;
    return raw;
  }
}

export async function fetchMediaInfo(url: string) {
  const ytdlp = await getYtdlp();
  try {
    const raw = await fetchRawInfo(ytdlp, url);
    return parseMediaInfo(raw, url);
  } catch (err) {
    throw new Error(extractYtdlpError(err));
  }
}

function buildFormatSpec(formatId: string, merge: boolean): string {
  if (!merge || formatId.includes("+") || formatId.includes("/")) return formatId;
  if (/mp3|m4a|audio|dash_aud|http_/i.test(formatId)) return formatId;
  if (/^\d+$/.test(formatId)) return `${formatId}+bestaudio/best`;
  return formatId;
}

export async function createDownloadStream(url: string, formatId: string, merge = false) {
  const ytdlp = await getYtdlp();
  const formatSpec = buildFormatSpec(formatId, merge);
  const args = [url, "-f", formatSpec, "--no-playlist", "--no-warnings", "-o", "-"];

  if (merge) {
    args.splice(args.length - 2, 0, "--merge-output-format", "mp4");
  }

  return ytdlp.execStream(args);
}

export async function fetchDirectUrl(sourceUrl: string): Promise<{
  body: ReadableStream<Uint8Array>;
  contentType: string;
}> {
  assertPublicHttpUrl(sourceUrl);

  const res = await fetch(sourceUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "image/*,*/*",
    },
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    throw new Error(`${ar.imageFetchFailed} (${res.status})`);
  }

  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const body = res.body;
  if (!body) throw new Error(ar.emptyImageResponse);

  return { body, contentType };
}

export async function checkYtdlpReady(): Promise<{ ready: boolean }> {
  try {
    await getYtdlp();
    return { ready: true };
  } catch {
    return { ready: false };
  }
}
