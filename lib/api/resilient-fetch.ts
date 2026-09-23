// Retrying fetch for server-side backend reads whose failure suppresses a
// rendered figure (the home headline loaders). SERVER-ONLY, like its callers.
//
// Why it exists: the covered-positions loader fans out ~50 requests in one
// Promise.all during an ISR regeneration, and its contract is all-or-nothing —
// one slow or erroring leg nulls the whole headline, and ISR then serves that
// absence for up to an hour. A transient hiccup on one leg is the failure mode
// worth absorbing; a structural failure (4xx, malformed envelope) is not, and
// still surfaces on the first attempt.
//
// What one call does: up to 1 + RETRY_DELAYS_MS.length attempts, each with its
// own timeout. An attempt is retried only when it threw (network error,
// timeout) or answered 429/5xx; any other response — including 4xx — returns
// immediately, and the caller's own status/envelope handling proceeds
// unchanged. The last attempt's response is returned (or its error rethrown),
// so callers see exactly the shapes they saw from bare fetch.
//
// Every retry logs a warning naming the URL and the reason. That line is the
// only trace a flappy endpoint leaves once retries start absorbing its
// failures — without it, a leg that fails every hour and recovers on retry
// would look permanently healthy.

/** Default per-attempt budget, sized for the listing count legs (each answers
 *  in well under a second when healthy — measured 0.1–1.0s across the roster).
 *  A caller whose endpoint is legitimately slow must say so: the roster-wide
 *  stats aggregate takes ~32s healthy, so the default would abort it on every
 *  attempt and convert a working endpoint into a permanent absence. */
const DEFAULT_ATTEMPT_TIMEOUT_MS = 15_000;
/** Delay before each retry — attempt N+2 waits RETRY_DELAYS_MS[N]. */
const RETRY_DELAYS_MS = [500, 2000];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts?: { attemptTimeoutMs?: number },
): Promise<Response> {
  const attemptTimeoutMs = opts?.attemptTimeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS;
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1]);

    // Next memoizes identical fetches for the length of a render pass — a
    // resolved 500 included — so a retry with the same url + options can be
    // answered from that memo without touching the network. The attempt
    // header makes each retry a distinct request. The backend ignores it.
    const headers = new Headers(init.headers);
    if (attempt > 0) headers.set("x-fetch-attempt", String(attempt));

    const isLast = attempt === RETRY_DELAYS_MS.length;
    try {
      const res = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(attemptTimeoutMs) });
      if (isRetryableStatus(res.status) && !isLast) {
        console.warn(`resilient-fetch: retry ${attempt + 1} for ${url} — ${res.status} ${res.statusText}`);
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (isLast) throw err;
      console.warn(`resilient-fetch: retry ${attempt + 1} for ${url} — ${err instanceof Error ? err.message : err}`);
    }
  }
  // Unreachable: the last attempt either returned or threw. Satisfies the
  // compiler's read of the loop.
  throw lastError;
}
