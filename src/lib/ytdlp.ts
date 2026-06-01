import YTDlpWrap from "yt-dlp-wrap";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import { ar } from "./ar";
import { parseMediaInfo, type RawInfo } from "./formats";
import { resolveMediaUrl } from "./resolve-media-url";
import { assertPublicHttpUrl } from "./security/url";

const execFileAsync = promisify(execFile);
const BIN_DIR = path.join(process.cwd(), ".bin");

const YTDLP_CONFIG_PATH = "/etc/yt-dlp.conf";

const BASE_INFO_FLAGS = [
  "-J",
  "--no-playlist",
  "--no-warnings",
  "--ignore-no-formats-error",
  "--retries",
  "2",
] as const;

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
    config: fs.existsSync(YTDLP_CONFIG_PATH) ? YTDLP_CONFIG_PATH : null,
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
  if (fs.existsSync(YTDLP_CONFIG_PATH)) {
    return ["--config-location", YTDLP_CONFIG_PATH];
  }
  return [];
}

/** Pip installs on Windows/dev may need GitHub EJS fetch; official Linux binary bundles EJS */
function getEjsArgs(): string[] {
  if (fs.existsSync(YTDLP_CONFIG_PATH)) return [];
  return ["--remote-components", "ejs:github"];
}

function getYouTubeStrategies(): string[][] {
  const js = getJsRuntimeArgs();
  const ejs = getEjsArgs();

  return [
    [...js, ...ejs],
    [...js, "--remote-components", "ejs:github"],
    [...js, "--remote-components", "ejs:npm"],
    [
      ...js,
      "--extractor-args",
      "youtube:player_client=android_vr,web",
    ],
    ["--extractor-args", "youtube:player_client=android_vr"],
    ["--extractor-args", "youtube:player_client=android,web"],
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
  const args = [...getConfigArgs(), "--no-playlist", "--no-warnings"];
  if (isYouTubeUrl(url)) {
    args.push(...getJsRuntimeArgs(), ...getEjsArgs());
    args.push("--extractor-args", "youtube:player_client=android_vr,web");
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
  };
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

async function runYtdlp(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const binaryPath = await ensureBinary();
  try {
    const { stdout, stderr } = await execFileAsync(binaryPath, args, {
      maxBuffer: 64 * 1024 * 1024,
      env: ytdlpEnv(),
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

function countYouTubeStreamFormats(raw: RawInfo): { video: number; audio: number } {
  const formats = raw.formats ?? [];
  let video = 0;
  let audio = 0;
  for (const f of formats) {
    const v = f.vcodec ?? "none";
    const a = f.acodec ?? "none";
    if (v !== "none") video++;
    else if (a !== "none") audio++;
  }
  return { video, audio };
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

  for (const extra of getYouTubeStrategies()) {
    try {
      const { stdout } = await runYtdlp([...base, ...extra, url]);
      const raw = parseRaw(stdout);
      if (!raw) continue;

      const { video, audio } = countYouTubeStreamFormats(raw);
      if (video > 0 || audio > 0) return raw;
    } catch (err) {
      lastError = err;
    }
  }

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

  if (/JavaScript runtime|js-runtimes|challenge solver|ejs:/i.test(combined)) {
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
    const raw = await withTimeout(fetchRawInfo(resolvedUrl), 90_000, ar.fetchTimeout);
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
  const args = [...getDownloadArgsForUrl(url), "-f", formatSpec, url, "-o", "-"];

  if (merge) {
    args.splice(args.length - 2, 0, "--merge-output-format", "mp4");
  }

  return ytdlp.execStream(args, { env: ytdlpEnv() });
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
