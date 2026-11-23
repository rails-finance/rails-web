// The wallet read's requests to the api host (ui-jobs 813). The host resets
// bursts of new TLS handshakes from one address, so the read keeps at most
// API_CONCURRENCY requests open at once and tries a request once more when its
// connection failed before any answer. An HTTP answer, whatever its status, is
// an answer and is not retried.
//
// A limiter in plain code holds whatever fetch each reader calls. Next's
// server fetch wraps undici, and a shared Agent passed to it as `dispatcher`
// is not a stable contract across Next releases.
//
// Import-free, so scripts/test/wallet-api-hop.test.mjs loads it directly.

/** At most this many wallet-read requests to the api host at once. */
export const API_CONCURRENCY = 4;

/** The pause before the one retry, so the retry is not part of the burst. */
export const RETRY_DELAY_MS = 150;

const CONNECTION_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "ETIMEDOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
]);
const CONNECTION_WORDS = /fetch failed|socket disconnected|socket hang up|other side closed|ECONNRESET/i;

/** Whether `err` is a connection that failed before any answer (a reset, a
 *  TLS handshake cut off, undici's "fetch failed"), looking through `cause`.
 *  An abort is not: the budget ran out or the reader left. */
export function isConnectionFailure(err: unknown): boolean {
  const chain: { name?: string; code?: string; message?: string }[] = [];
  for (let e: unknown = err; e != null && typeof e === "object" && chain.length < 5; ) {
    const x = e as { name?: string; code?: string; message?: string; cause?: unknown };
    chain.push(x);
    e = x.cause;
  }
  if (chain.some((x) => x.name === "AbortError" || x.name === "TimeoutError")) return false;
  return chain.some((x) => (x.code != null && CONNECTION_CODES.has(x.code)) || CONNECTION_WORDS.test(x.message ?? ""));
}

/** A queue that runs at most `max` of the functions given to it at once. */
export function createLimiter(max: number) {
  let running = 0;
  const waiting: (() => void)[] = [];
  const release = () => {
    running--;
    waiting.shift()?.();
  };
  return async function limit<T>(fn: () => Promise<T>): Promise<T> {
    if (running >= max) await new Promise<void>((go) => waiting.push(go));
    running++;
    try {
      return await fn();
    } finally {
      release();
    }
  };
}

/** Run `fn`, and once more after `delayMs` where it failed at the connection
 *  and `signal` has not aborted. */
export async function retryOnConnectionFailure<T>(
  fn: () => Promise<T>,
  signal?: AbortSignal,
  delayMs: number = RETRY_DELAY_MS,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isConnectionFailure(err) || signal?.aborted) throw err;
    await new Promise((go) => setTimeout(go, delayMs));
    if (signal?.aborted) throw err;
    return fn();
  }
}

const limit = createLimiter(API_CONCURRENCY);

/** One wallet-read request to the api host: queued behind the cap, retried
 *  once on a connection failure. */
export function apiHop<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  return limit(() => retryOnConnectionFailure(fn, signal));
}
