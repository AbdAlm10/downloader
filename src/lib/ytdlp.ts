import YTDlpWrap from "yt-dlp-wrap";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import { ar } from "./ar";
import { parseMediaInfo, type RawInfo } from "./formats";
import { resolveMediaUrl } from "./resolve-media-url";
import { assertPublicHttpUrl } from "./security/url";
import { fetchYouTubeViaInvidious } from "./youtube-fallback";

const execFileAsync = promisify(execFile);
const BIN_DIR = path.join(process.cwd(), ".bin");

const BASE_INFO_FLAGS = [
  "-J",
  "--no-playlist",
  "--no-warnings",
  "--ignore-no-formats-error",
  "--retries",
  "3",
] as const;

function getConfigPath(): string | null {
  const fromEnv = process.env.YTDLP_CONFIG_PATH?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  if (fs.existsSync("/etc/yt-dlp.conf")) return "/etc/yt-dlp.conf";
  const local = path.join(process.cwd(), "config", "yt-dlp.conf");
  if (fs.existsSync(local)) return local;
  return null;
}

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

export function getYtdlpRuntimeStatus() {
  return {
    deno: resolveRuntimeBin("deno"),
    node: resolveRuntimeBin("node"),
    config: getConfigPath(),
    binary: getBinPath(),
  };
}

function isYouTubeUrl(url: string): boolean {
  return /youtube\.com|youtu\.be/i.test(url);
}

function resolveRuntimeBin(name: "deno" | "node"): string | null {
  const envKey = name === "deno" ? "YTDLP_DENO_PATH" : "YTDLP_NODE_PATH";
  const candidates = [
    process.env[envKey]?.trim(),
    name === "node" ? process.execPath : undefined,
    path.join("/usr/local/bin", name),
    path.join(process.cwd(), ".bin", process.platform === "win32" ? `${name}.exe` : name),
  ].filter((p): p is string => Boolean(p?.trim()));

  for (const bin of candidates) {
    if (fs.existsSync(bin)) return bin;
  }
  return null;
}

function getJsRuntimeArgs(): string[] {
  const runtimes: string[] = [];
  const deno = resolveRuntimeBin("deno");
  const node = resolveRuntimeBin("node");
  if (deno) runtimes.push(`deno:${deno}`);
  if (node) runtimes.push(`node:${node}`);
  if (runtimes.length === 0) return [];
  return ["--js-runtimes", runtimes.join(",")];
}

function getConfigArgs(): string[] {
  const configPath = getConfigPath();
  if (configPath) return ["--config-location", configPath];
  return [];
}

function getCookieArgs(): string[] {
  const cookiesFile = process.env.YTDLP_COOKIES_FILE?.trim();
  if (cookiesFile && fs.existsSync(cookiesFile)) {
    return ["--cookies", cookiesFile];
  }
  return [];
}

function getYouTubeStrategies(): string[][] {
  const js = getJsRuntimeArgs();
  const cookies = getCookieArgs();

  const withCookies = (extra: string[]) => [...cookies, ...extra];

  return [
    withCookies([]),
    withCookies([...js]),
    withCookies([...js, "--remote-components", "ejs:github"]),
    withCookies([...js, "--remote-components", "ejs:npm"]),
    withCookies(["--extractor-args", "youtube:player_client=web,mweb,android"]),
    withCookies(["--extractor-args", "youtube:player_client=tv_embedded,web"]),
    withCookies(["--extractor-args", "youtube:player_client=android_vr,web"]),
    withCookies(["--extractor-args", "youtube:player_client=android_vr"]),
    withCookies(["--extractor-args", "youtube:player_client=mweb"]),
  ];
}

function getInfoArgsForUrl(url: string): string[] {
  return [
    ...getConfigArgs(),
    ...BASE_INFO_FLAGS,
    "--socket-timeout",
    /facebook|instagram|tiktok/i.test(url) ? "40" : isYouTubeUrl(url) ? "90" : "25",
  ];
}

function getDownloadArgsForUrl(url: string): string[] {
  const args = [...getConfigArgs(), ...getCookieArgs(), "--no-playlist", "--no-warnings"];
  if (isYouTubeUrl(url)) {
    args.push(...getJsRuntimeArgs(), "--remote-components", "ejs:github");
    args.push("--extractor-args", "youtube:player_client=web,mweb,android");
  }
  return args;
}

function ytdlpEnv(): NodeJS.ProcessEnv {
  const extra = "/usr/local/bin";
  const pathEnv = process.env.PATH ?? "";
  return {
    ...process.env,
    PATH: pathEnv.includes(extra) ? pathEnv : `${extra}:${pathEnv}`,
    HOME: process.env.HOME ?? "/tmp",
    TMPDIR: process.env.TMPDIR ?? process.env.TEMP ?? "/tmp",
  };
}

let ytdlpInstance: YTDlpWrap | null = null;
let initPromise: Promise<YTDlpWrap> | null = null;
let updatePromise: Promise<void> | null = null;

async function maybeUpdateBinary(binPath: string): Promise<void> {
  if (process.env.YTDLP_AUTO_UPDATE === "false") return;
  if (process.platform === "win32") return;
  if (process.env.YTDLP_PATH?.trim()) return;

  if (!updatePromise) {
    updatePromise = execFileAsync(binPath, ["--update-to", "stable"], {
      timeout: 90_000,
      env: ytdlpEnv(),
    })
      .then(() => undefined)
      .catch(() => undefined);
  }

  await updatePromise;
}

async function ensureBinary(): Promise<string> {
  const binPath = getBinPath();

  if (fs.existsSync(binPath)) {
    try {
      fs.accessSync(binPath, fs.constants.X_OK);
    } catch {
      fs.chmodSync(binPath, 0o755);
    }
    await maybeUpdateBinary(binPath);
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

async function runYtdlp(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const binaryPath = await ensureBinary();
  try {
    const { stdout, stderr } = await execFileAsync(binaryPath, args, {
      maxBuffer: 64 * 1024 * 1024,
      env: ytdlpEnv(),
      timeout: 120_000,
    });
    return { stdout, stderr: stderr ?? "" };
  } catch (err: unknown) {
    const execErr = err as { stdout?: string; stderr?: string; message?: string };
    const error = new Error(execErr.message ?? "yt-dlp failed");
    Object.assign(error, {
      stderr: execErr.stderr ?? "",
      stdout: execErr.stdout ?? "",
    });
    throw error;
  }
}

function rawHasStreamFormats(raw: RawInfo): boolean {
  const formats = raw.formats ?? [];
  for (const f of formats) {
    const v = f.vcodec ?? "none";
    const a = f.acodec ?? "none";
    if (v !== "none" || a !== "none") return true;
  }
  return false;
}

function parseRaw(stdout: string): RawInfo | null {
  const trimmed = stdout.trim();
  if (!trimmed || trimmed === "null") return null;
  try {
    return JSON.parse(trimmed) as RawInfo;
  } catch {
    return null;
  }
}

async function fetchRawInfo(url: string): Promise<RawInfo> {
  const base = [...getInfoArgsForUrl(url)];

  if (!isYouTubeUrl(url)) {
    const { stdout } = await runYtdlp([...base, url]);
    const raw = parseRaw(stdout);
    if (!raw) throw new Error(ar.fetchFailed);
    return raw;
  }

  let lastError: unknown = null;
  let lastRaw: RawInfo | null = null;

  for (const extra of getYouTubeStrategies()) {
    try {
      const { stdout } = await runYtdlp([...base, ...extra, url]);
      const raw = parseRaw(stdout);
      if (!raw) continue;
      lastRaw = raw;
      if (rawHasStreamFormats(raw)) return raw;
    } catch (err) {
      lastError = err;
    }
  }

  if (lastRaw && lastRaw.title) return lastRaw;
  if (lastError) throw lastError;
  throw new Error(ar.youtubeEngineMissing);
}

function extractYtdlpError(err: unknown): string {
  if (!(err instanceof Error)) return ar.fetchFailed;

  if (err.message === ar.youtubeEngineMissing) return err.message;

  let msg = err.message;
  const stderr =
    err && typeof err === "object" && "stderr" in err && typeof err.stderr === "string"
      ? err.stderr
      : "";

  const combined = `${msg}\n${stderr}`;
  const errorLine = combined.split(/\r?\n/).find((line) => line.includes("ERROR:"));
  if (errorLine) msg = errorLine;

  if (/JavaScript runtime|js-runtimes|challenge solver|ejs:|n challenge solving/i.test(combined)) {
    return ar.youtubeEngineMissing;
  }

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

export async function fetchMediaInfo(url: string) {
  await getYtdlp();
  const resolvedUrl = await resolveMediaUrl(url);

  try {
    const raw = await withTimeout(fetchRawInfo(resolvedUrl), 110_000, ar.fetchTimeout);
    const info = parseMediaInfo(raw, resolvedUrl);
    if (
      info.videoFormats.length > 0 ||
      info.audioFormats.length > 0 ||
      info.imageFormats.length > 0
    ) {
      return info;
    }
  } catch (err) {
    if (!isYouTubeUrl(resolvedUrl)) {
      throw new Error(extractYtdlpError(err));
    }
  }

  if (isYouTubeUrl(resolvedUrl)) {
    const fallback = await fetchYouTubeViaInvidious(resolvedUrl);
    if (
      fallback &&
      (fallback.videoFormats.length > 0 || fallback.audioFormats.length > 0)
    ) {
      return fallback;
    }
  }

  throw new Error(ar.youtubeEngineMissing);
}

function buildFormatSpec(formatId: string, merge: boolean): string {
  if (!merge || formatId.includes("+") || formatId.includes("/")) return formatId;
  if (/mp3|m4a|audio|dash_aud|http_|^inv-a-/i.test(formatId)) return formatId;
  if (/^inv-/.test(formatId)) return formatId;
  if (/^\d+$/.test(formatId)) return `${formatId}+bestaudio/best`;
  return formatId;
}

export async function createDownloadStream(url: string, formatId: string, merge = false) {
  if (/^inv-/.test(formatId)) {
    throw new Error(ar.videoDownloadFailed);
  }

  const ytdlp = await getYtdlp();
  const formatSpec = buildFormatSpec(formatId, merge);
  const args = [...getDownloadArgsForUrl(url), "-f", formatSpec, url, "-o", "-"];

  if (merge) {
    args.splice(args.length - 2, 0, "--merge-output-format", "mp4");
  }

  return ytdlp.execStream(args, { env: ytdlpEnv() });
}

const STREAM_MIME: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mkv: "video/x-matroska",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  opus: "audio/opus",
  ogg: "audio/ogg",
  wav: "audio/wav",
};

export function mimeForMediaExt(ext: string, fallback: string): string {
  return STREAM_MIME[ext.toLowerCase()] ?? fallback;
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
      Accept: "*/*",
    },
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    throw new Error(`${ar.imageFetchFailed} (${res.status})`);
  }

  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const body = res.body;
  if (!body) throw new Error(ar.emptyImageResponse);

  return { body, contentType };
}
