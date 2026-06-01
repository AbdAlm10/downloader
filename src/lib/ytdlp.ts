import YTDlpWrap from "yt-dlp-wrap";
import path from "path";
import fs from "fs";
import { ar } from "./ar";
import { parseMediaInfo, type RawInfo } from "./formats";
import { resolveMediaUrl } from "./resolve-media-url";
import { assertPublicHttpUrl } from "./security/url";

const BIN_DIR = path.join(process.cwd(), ".bin");

export function getBinPath(): string {
  const fromEnv = process.env.YTDLP_PATH?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  const local = path.join(BIN_DIR, process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
  return local;
}

export function checkBinaryOnDisk(): {
  ready: boolean;
  binaryPath: string;
  binaryExists: boolean;
} {
  const binaryPath = getBinPath();
  const binaryExists = fs.existsSync(binaryPath);
  return { ready: binaryExists, binaryPath, binaryExists };
}

function getInfoArgsForUrl(url: string): string[] {
  const args = [
    "-J",
    "--no-playlist",
    "--no-warnings",
    "--ignore-no-formats-error",
    "--retries",
    "2",
    "--socket-timeout",
    /facebook|instagram|tiktok/i.test(url) ? "40" : "25",
  ];

  if (/youtube\.com|youtu\.be/i.test(url)) {
    args.push("--extractor-args", "youtube:player_client=android,web");
  }

  return args;
}

let ytdlpInstance: YTDlpWrap | null = null;
let initPromise: Promise<YTDlpWrap> | null = null;

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
      const binaryPath = await ensureBinary();
      const instance = new YTDlpWrap(binaryPath);
      ytdlpInstance = instance;
      return instance;
    })().catch((err) => {
      initPromise = null;
      throw err;
    });
  }

  return initPromise;
}

function extractYtdlpError(err: unknown): string {
  if (!(err instanceof Error)) return ar.fetchFailed;

  let msg = err.message;

  const errorLine = msg.split(/\r?\n/).find((line) => line.includes("ERROR:"));
  if (errorLine) msg = errorLine;

  if (/\[facebook\]|facebook\.com/i.test(msg)) {
    if (/login|Sign in|cookies|logged in/i.test(msg)) return ar.loginRequired;
    return ar.facebookRestricted;
  }

  if (msg.includes("Private video")) return ar.privateVideo;
  if (msg.includes("Sign in") || msg.includes("login")) return ar.loginRequired;
  if (msg.includes("Unsupported URL")) return ar.unsupportedUrl;
  if (msg.includes("Unable to download") || msg.includes("HTTP Error")) return ar.unreachable;
  if (msg.includes("timed out") || msg.includes("Timeout")) return ar.fetchTimeout;

  if (msg.includes("Command failed:") || msg.includes("yt-dlp")) {
    return ar.fetchFailed;
  }

  if (msg.length > 280) return msg.slice(0, 280) + "…";
  return msg;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

async function fetchRawInfo(ytdlp: YTDlpWrap, url: string): Promise<RawInfo> {
  const run = async () => {
    const stdout = await ytdlp.execPromise([url, ...getInfoArgsForUrl(url)]);
    return JSON.parse(stdout) as RawInfo;
  };

  return withTimeout(run(), 55_000, ar.fetchTimeout);
}

export async function fetchMediaInfo(url: string) {
  const ytdlp = await getYtdlp();
  const resolvedUrl = await resolveMediaUrl(url);

  try {
    const raw = await fetchRawInfo(ytdlp, resolvedUrl);
    return parseMediaInfo(raw, resolvedUrl);
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
