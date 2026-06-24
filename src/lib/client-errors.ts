import { ar } from "./ar";

const AR_MESSAGES = new Set(Object.values(ar));

function isArabicAppMessage(message: string): boolean {
  return AR_MESSAGES.has(message as (typeof ar)[keyof typeof ar]);
}

/** Map thrown errors to user-visible Arabic messages. */
export function resolveUiError(err: unknown, fallback: string): string {
  if (err instanceof DOMException && err.name === "AbortError") {
    return ar.fetchTimeout;
  }

  if (!(err instanceof Error)) {
    return fallback;
  }

  if (err.name === "TimeoutError" || /timed?\s*out/i.test(err.message)) {
    return ar.fetchTimeout;
  }

  if (isArabicAppMessage(err.message)) {
    return err.message;
  }

  const lower = err.message.toLowerCase();
  if (
    lower === "failed to fetch" ||
    lower.includes("networkerror") ||
    lower.includes("load failed")
  ) {
    return ar.networkError;
  }

  if (err.message.length > 0 && err.message.length <= 320) {
    return err.message;
  }

  return fallback;
}

export function abortSignalWithTimeout(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}
