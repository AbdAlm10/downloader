import YTDlpWrap from "yt-dlp-wrap";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import { ar } from "./ar";
import { parseMediaInfo, type RawInfo } from "./formats";
import { resolveMediaUrl } from "./resolve-media-url";
import { assertPublicHttpUrl } from "./security/url";
import { applyYouTubeFormatPresets, resolveYoutubeFormatSpec } from "./youtube-formats";

const execFileAsync = promisify(execFile);
const BIN_DIR = path.join(process.cwd(), ".bin");

const YOUTUBE_INFO_TIMEOUT_MS = 28_000;
const OTHER_INFO_TIMEOUT_MS = 35_000;
const FETCH_MEDIA_TIMEOUT_MS = 40_000;

const BASE_INFO_FLAGS = [
  "-J",
  "--no-playlist",
  "--no-warnings",
  "--ignore-no-formats-error",
  "--retries",
  "1",
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

/** One fast YouTube profile (config + JS + player clients). */
function getYouTubePrimaryArgs(): string[] {
  return [
    ...getCookieArgs(),
    ...getJsRuntimeArgs(),
    "--extractor-args",
    "youtube:player_client=web,mweb,android",
  ];
}

/** Alternate player clients when the primary returns metadata only. */
function getYouTubeFallbackArgs(): string[] {
  return [
    ...getCookieArgs(),
    ...getJsRuntimeArgs(),
    "--remote-components",
    "ejs:github",
    "--extractor-args",
    "youtube:player_client=android_vr,web",
  ];
}

function getInfoArgsForUrl(url: string): string[] {
  const isYt = isYouTubeUrl(url);
  return [
    ...getConfigArgs(),
    ...BASE_INFO_FLAGS,
    "--socket-timeout",
    isYt ? "20" : /facebook|instagram|tiktok/i.test(url) ? "30" : "20",
  ];
}

function getDownloadArgsForUrl(url: string): string[] {
  const args = [...getConfigArgs(), ...getCookieArgs(), "--no-playlist", "--no-warnings"];
  if (isYouTubeUrl(url)) {
    args.push(...getYouTubePrimaryArgs());
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

function scheduleBackgroundBinaryUpdate(binPath: string): void {
  if (process.env.YTDLP_AUTO_UPDATE === "false") return;
  if (process.platform === "win32") return;
  if (process.env.YTDLP_PATH?.trim()) return;

  void execFileAsync(binPath, ["--update-to", "stable"], {
    timeout: 120_000,
    env: ytdlpEnv(),
  }).catch(() => undefined);
}

async function ensureBinary(): Promise<string> {
  const binPath = getBinPath();

  if (fs.existsSync(binPath)) {
    try {
      fs.accessSync(binPath, fs.constants.X_OK);
    } catch {
      fs.chmodSync(binPath, 0o755);
    }
    scheduleBackgroundBinaryUpdate(binPath);
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

/** Preload binary at server start so the first «تحليل» is not blocked by download/update. */
export function warmYtdlp(): Promise<void> {
  return getYtdlp().then(() => undefined);
}

async function runYtdlp(args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  const binaryPath = await ensureBinary();

  const execPromise = execFileAsync(binaryPath, args, {
    maxBuffer: 64 * 1024 * 1024,
    env: ytdlpEnv(),
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(ar.fetchTimeout)), timeoutMs);
  });

  try {
    const { stdout, stderr } = await Promise.race([execPromise, timeoutPromise]);
    return { stdout, stderr: stderr ?? "" };
  } catch (err: unknown) {
    const execErr = err as { stdout?: string; stderr?: string; message?: string };
    const error = new Error(execErr.message ?? "yt-dlp failed");
    Object.assign(error, {
      stderr: execErr.stderr ?? "",
      stdout: execErr.stdout ?? "",
    });
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
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

function isYouTubeRetryableError(err: unknown): boolean {
  const stderr =
    err && typeof err === "object" && "stderr" in err && typeof err.stderr === "string"
      ? err.stderr
      : "";
  const msg = err instanceof Error ? err.message : "";
  const combined = `${msg}\n${stderr}`;
  return /JavaScript runtime|js-runtimes|challenge solver|ejs:|n challenge solving/i.test(
    combined
  );
}

async function fetchRawInfoYouTube(url: string, base: string[]): Promise<RawInfo> {
  const timeout = YOUTUBE_INFO_TIMEOUT_MS;
  let lastRaw: RawInfo | null = null;
  let lastError: unknown = null;

  const tryOnce = async (extra: string[]) => {
    const { stdout } = await runYtdlp([...base, ...extra, url], timeout);
    const raw = parseRaw(stdout);
    if (!raw) throw new Error(ar.fetchFailed);
    return raw;
  };

  try {
    const raw = await tryOnce(getYouTubePrimaryArgs());
    if (rawHasStreamFormats(raw)) return raw;
    if (raw.title) return raw;
    lastRaw = raw;
  } catch (err) {
    lastError = err;
    if (!isYouTubeRetryableError(err)) throw err;
  }

  try {
    const raw = await tryOnce(getYouTubeFallbackArgs());
    if (rawHasStreamFormats(raw)) return raw;
    if (raw.title) return raw;
    lastRaw = raw;
  } catch (err) {
    lastError = err;
  }

  if (lastRaw?.title) return lastRaw;
  if (lastError) throw lastError;
  throw new Error(ar.youtubeEngineMissing);
}

async function fetchRawInfo(url: string): Promise<RawInfo> {
  const base = [...getInfoArgsForUrl(url)];

  if (isYouTubeUrl(url)) {
    return fetchRawInfoYouTube(url, base);
  }

  const { stdout } = await runYtdlp([...base, url], OTHER_INFO_TIMEOUT_MS);
  const raw = parseRaw(stdout);
  if (!raw) throw new Error(ar.fetchFailed);
  return raw;
}

function extractYtdlpError(err: unknown): string {
  if (!(err instanceof Error)) return ar.fetchFailed;

  if (err.message === ar.youtubeEngineMissing || err.message === ar.fetchTimeout) {
    return err.message;
  }

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
    const raw = await withTimeout(fetchRawInfo(resolvedUrl), FETCH_MEDIA_TIMEOUT_MS, ar.fetchTimeout);
    const info = parseMediaInfo(raw, resolvedUrl);
    return isYouTubeUrl(resolvedUrl) ? applyYouTubeFormatPresets(info) : info;
  } catch (err) {
    throw new Error(extractYtdlpError(err));
  }
}

function buildFormatSpec(formatId: string, merge: boolean): string {
  const ytSpec = resolveYoutubeFormatSpec(formatId);
  if (ytSpec) return ytSpec;

  if (formatId.includes("+") || formatId.includes("/") || formatId.includes("[")) {
    return formatId;
  }
  if (!merge) return formatId;
  if (/mp3|m4a|audio|dash_aud|http_|^inv-a-/i.test(formatId)) return formatId;
  if (/^inv-/.test(formatId)) return formatId;
  if (/^\d+$/.test(formatId)) return `${formatId}+bestaudio/best`;
  return formatId;
}

function needsMerge(formatId: string, mergeFlag: boolean): boolean {
  const spec = resolveYoutubeFormatSpec(formatId) ?? formatId;
  return mergeFlag || spec.includes("+");
}

export async function createDownloadStream(url: string, formatId: string, merge = false) {
  const ytdlp = await getYtdlp();
  const formatSpec = buildFormatSpec(formatId, merge);
  const doMerge = needsMerge(formatId, merge);
  const args = [...getDownloadArgsForUrl(url), "-f", formatSpec, url, "-o", "-"];

  if (doMerge) {
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
