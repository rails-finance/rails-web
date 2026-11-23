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

/** The reason a signal aborted with, as an error. */
const abortError = (signal: AbortSignal): unknown =>
  signal.reason ?? Object.assign(new Error("aborted"), { name: "AbortError" });

/** A queue that runs at most `max` of the functions given to it at once, in
 *  the order given. A finishing job hands its slot straight to the next one
 *  waiting, so no newcomer takes it between; a job whose `signal` aborts while
 *  it waits leaves the queue and rejects. */
export function createLimiter(max: number) {
  let running = 0;
  const waiting: { go: () => void }[] = [];
  const release = () => {
    const next = waiting.shift();
    if (next) next.go();
    else running--;
  };
  const acquire = (signal?: AbortSignal): Promise<void> => {
    if (signal?.aborted) return Promise.reject(abortError(signal));
    if (running < max && waiting.length === 0) {
      running++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        const i = waiting.indexOf(entry);
        if (i >= 0) waiting.splice(i, 1);
        reject(abortError(signal!));
      };
      const entry = {
        go: () => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        },
      };
      waiting.push(entry);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  };
  return async function limit<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await acquire(signal);
    try {
      return await fn();
    } finally {
      release();
    }
  };
}

/** Wait `ms`, or reject at once where `signal` aborts first. */
function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError(signal));
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal!));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
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
    await pause(delayMs, signal);
    return fn();
  }
}

const limit = createLimiter(API_CONCURRENCY);

/** One wallet-read request to the api host: queued behind the cap (leaving
 *  the queue where `signal` aborts), retried once on a connection failure.
 *  `fn` starts only once the slot is granted, so a budget it sets runs from
 *  then. */
export function apiHop<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  return limit(() => retryOnConnectionFailure(fn, signal), signal);
}
