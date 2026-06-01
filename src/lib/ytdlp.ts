import YTDlpWrap from "yt-dlp-wrap";
import path from "path";
import fs from "fs";
import { ar } from "./ar";
import { parseMediaInfo, type RawInfo } from "./formats";
import { assertPublicHttpUrl } from "./security/url";

const BIN_DIR = path.join(process.cwd(), ".bin");

function getBinPath(): string {
  const fromEnv = process.env.YTDLP_PATH?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  const local = path.join(BIN_DIR, process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
  if (fs.existsSync(local)) return local;

  return local;
}

const INFO_ARGS = [
  "-J",
  "--no-playlist",
  "--no-warnings",
  "--ignore-no-formats-error",
  "--retries",
  "3",
  "--socket-timeout",
  "60",
  "--extractor-args",
  "youtube:player_client=android,web",
];

let ytdlpInstance: YTDlpWrap | null = null;
let initPromise: Promise<YTDlpWrap> | null = null;
let lastInitError: string | undefined;

async function ensureBinary(): Promise<string> {
  const binPath = getBinPath();

  if (fs.existsSync(binPath)) {
    try {
      fs.accessSync(binPath, fs.constants.X_OK);
    } catch {
      fs.chmodSync(binPath, 0o755);
    }
    return binPath;
  }

  fs.mkdirSync(BIN_DIR, { recursive: true });
  await YTDlpWrap.downloadFromGithub(binPath, undefined, process.platform);
  fs.chmodSync(binPath, 0o755);
  return binPath;
}

export async function getYtdlp(): Promise<YTDlpWrap> {
  if (ytdlpInstance) return ytdlpInstance;

  if (!initPromise) {
    initPromise = (async () => {
      try {
        const binaryPath = await ensureBinary();
        const instance = new YTDlpWrap(binaryPath);
        await instance.getVersion();
        ytdlpInstance = instance;
        lastInitError = undefined;
        return instance;
      } catch (err) {
        lastInitError = err instanceof Error ? err.message : String(err);
        initPromise = null;
        throw err;
      }
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

export async function checkYtdlpReady(): Promise<{
  ready: boolean;
  version?: string;
  binaryPath?: string;
  binaryExists?: boolean;
  initError?: string;
}> {
  const binaryPath = getBinPath();
  const binaryExists = fs.existsSync(binaryPath);

  try {
    const ytdlp = await getYtdlp();
    const version = await ytdlp.getVersion();
    return {
      ready: true,
      version: version?.trim(),
      binaryPath,
      binaryExists,
    };
  } catch {
    const verbose =
      process.env.DEPLOY_VERBOSE_ERRORS === "true" ||
      process.env.NODE_ENV === "development";

    return {
      ready: false,
      binaryPath,
      binaryExists,
      initError: verbose ? lastInitError : undefined,
    };
  }
}
