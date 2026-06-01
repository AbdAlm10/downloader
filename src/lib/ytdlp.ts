import YTDlpWrap from "yt-dlp-wrap";
import { execFile, spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { randomUUID } from "crypto";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import os from "os";
import { PassThrough, type Readable } from "stream";
import { ar } from "./ar";
import { parseMediaInfo, type RawInfo } from "./formats";
import { resolveMediaUrl } from "./resolve-media-url";
import { assertPublicHttpUrl } from "./security/url";
import {
  isYoutubePresetFormatId,
  resolveYoutubeFormatSpec,
} from "./youtube-formats";
import { fetchYoutubeMediaInfo, isYoutubeUrl } from "./youtube";
import { createInnertubeDownloadStream, isInnertubeFormatId } from "./youtube-innertube";
import { isPipedFormatId } from "./youtube-piped";

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
  return isYoutubeUrl(url);
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

export function extractYtdlpError(err: unknown): string {
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
  if (
    /Sign in|not a bot|LOGIN_REQUIRED|confirm you/i.test(msg) ||
    msg.includes("login")
  ) {
    return isYouTubeUrl(msg) ? ar.youtubeEngineMissing : ar.loginRequired;
  }
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
  const resolvedUrl = await resolveMediaUrl(url);

  if (isYouTubeUrl(resolvedUrl)) {
    const alt = await withTimeout(
      fetchYoutubeMediaInfo(resolvedUrl),
      FETCH_MEDIA_TIMEOUT_MS,
      ar.fetchTimeout
    );
    if (alt) return alt;
    throw new Error(ar.youtubeEngineMissing);
  }

  await getYtdlp();

  try {
    const raw = await withTimeout(fetchRawInfo(resolvedUrl), FETCH_MEDIA_TIMEOUT_MS, ar.fetchTimeout);
    return parseMediaInfo(raw, resolvedUrl);
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
  if (resolveYoutubeFormatSpec(formatId)) return false;
  const spec = formatId;
  return mergeFlag || spec.includes("+");
}

function useFileDownload(): boolean {
  if (process.env.YTDLP_USE_FILE_DOWNLOAD === "false") return false;
  return process.platform !== "win32";
}

async function waitForFileData(filePath: string, maxMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      if (fs.statSync(filePath).size > 0) return;
    } catch {
      /* file not created yet */
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error(ar.fetchTimeout);
}

function buildDownloadArgs(url: string, formatId: string, merge: boolean, outputPath: string) {
  const formatSpec = buildFormatSpec(formatId, merge);
  const doMerge = needsMerge(formatId, merge);
  const args = [
    ...getDownloadArgsForUrl(url),
    "--no-part",
    "--retries",
    "3",
    "-f",
    formatSpec,
    "-o",
    outputPath,
  ];
  if (doMerge) args.push("--merge-output-format", "mp4");
  args.push(url);
  return args;
}

/** Stream from a growing temp file — response starts immediately (fixes Render 502). */
function attachFileTailDownload(
  output: PassThrough,
  url: string,
  formatId: string,
  merge: boolean
): void {
  void (async () => {
    const binaryPath = await ensureBinary();
    const tmpPath = path.join(os.tmpdir(), `ytdlp-${randomUUID()}.mp4`);
    const args = buildDownloadArgs(url, formatId, merge, tmpPath);

    let stderr = "";
    let offset = 0;
    let poll: ReturnType<typeof setInterval> | null = null;
    let proc: ChildProcessWithoutNullStreams | null = null;

    const cleanup = () => {
      if (poll) clearInterval(poll);
      fs.unlink(tmpPath, () => {});
    };

    const pump = () => {
      if (!fs.existsSync(tmpPath)) return;
      let size = 0;
      try {
        size = fs.statSync(tmpPath).size;
      } catch {
        return;
      }

      if (size > offset) {
        const chunk = fs.createReadStream(tmpPath, { start: offset, end: size - 1 });
        offset = size;
        chunk.on("data", (data) => output.write(data));
        chunk.on("error", (err) => {
          cleanup();
          proc?.kill();
          output.destroy(err);
        });
      }

      if (proc?.exitCode !== null && offset >= size) {
        cleanup();
        output.end();
      }
    };

    proc = spawn(binaryPath, args, { env: ytdlpEnv() });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("error", (err) => {
      cleanup();
      output.destroy(err);
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        cleanup();
        const msg = stderr.split("\n").find((l) => l.includes("ERROR:")) ?? ar.downloadFailed;
        output.destroy(new Error(msg));
        return;
      }
      pump();
    });

    try {
      await waitForFileData(tmpPath, 90_000);
      poll = setInterval(pump, 200);
      pump();
    } catch (err) {
      proc.kill();
      cleanup();
      output.destroy(err instanceof Error ? err : new Error(ar.downloadFailed));
    }
  })();
}

function attachStdoutDownload(output: PassThrough, url: string, formatId: string, merge: boolean): void {
  void (async () => {
    try {
      const ytdlp = await getYtdlp();
      const formatSpec = buildFormatSpec(formatId, merge);
      const doMerge = needsMerge(formatId, merge);
      const args = [...getDownloadArgsForUrl(url)];
      if (doMerge) args.push("--merge-output-format", "mp4");
      args.push("-f", formatSpec, url);
      const src = ytdlp.execStream(args, { env: ytdlpEnv() });
      src.on("data", (chunk) => output.write(chunk));
      src.on("end", () => output.end());
      src.on("error", (err) => output.destroy(err));
    } catch (err) {
      output.destroy(err instanceof Error ? err : new Error(ar.downloadFailed));
    }
  })();
}

export async function downloadToTempFile(
  url: string,
  formatId: string,
  merge = false
): Promise<string> {
  const binaryPath = await ensureBinary();
  const tmpPath = path.join(os.tmpdir(), `ytdlp-${randomUUID()}.mp4`);
  const args = buildDownloadArgs(url, formatId, merge, tmpPath);
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(binaryPath, args, { env: ytdlpEnv() });
    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else {
        const raw = stderr.split("\n").find((l) => l.includes("ERROR:")) ?? ar.downloadFailed;
        fs.unlink(tmpPath, () => {});
        reject(new Error(extractYtdlpError(new Error(raw))));
      }
    });
  });
  return tmpPath;
}

export function createDownloadStream(url: string, formatId: string, merge = false): Readable {
  if (isYoutubeUrl(url) && isYoutubePresetFormatId(formatId)) {
    throw new Error(ar.youtubeEngineMissing);
  }

  if (isInnertubeFormatId(formatId)) {
    const output = new PassThrough();
    void createInnertubeDownloadStream(url, formatId)
      .then((src) => {
        src.on("data", (chunk) => output.write(chunk));
        src.on("end", () => output.end());
        src.on("error", (err) => output.destroy(err));
      })
      .catch((err) => output.destroy(err instanceof Error ? err : new Error(ar.downloadFailed)));
    return output;
  }

  if (isPipedFormatId(formatId)) {
    throw new Error(ar.downloadFailed);
  }

  const output = new PassThrough();
  if (useFileDownload()) {
    attachFileTailDownload(output, url, formatId, merge);
  } else {
    attachStdoutDownload(output, url, formatId, merge);
  }
  return output;
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

  const isGoogleVideo = /googlevideo\.com|gvt1\.com|youtube\.com\/videoplayback/i.test(sourceUrl);

  const res = await fetch(sourceUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "*/*",
      ...(isGoogleVideo
        ? {
            Referer: "https://www.youtube.com/",
            Origin: "https://www.youtube.com",
          }
        : {}),
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
