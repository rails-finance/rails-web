// The api's whole-history budget, as the web carries it. Client-safe.
// ----------------------------------------------------------------------------
// rails-server answers 429 to a reader whose per-minute budget of whole-history
// reads is spent, with a `Retry-After` in seconds (rails-ops
// TO-DO-arbitrum-scoping.md item 27). A server reader throws `ApiOverBudget`
// on that answer, the chain route passes it on as a 429 of its own, and the
// page's fetch client maps it to its own error and asks again on a timer.
// Every other failure keeps its old path: a reader's null, the route's 503.

/** Retry-After when the answer carries none, or one that does not parse. */
export const RETRY_AFTER_DEFAULT_S = 30;
/** The budget is per minute: no wait is longer. */
export const RETRY_AFTER_MAX_S = 60;

/** Seconds from a `Retry-After` value (delta-seconds or an HTTP date), at
 *  least 1 and at most RETRY_AFTER_MAX_S. */
export function parseRetryAfter(value: string | null | undefined, now: number = Date.now()): number {
  const raw = value?.trim();
  if (!raw) return RETRY_AFTER_DEFAULT_S;
  let seconds: number;
  if (/^\d+$/.test(raw)) seconds = Number(raw);
  else {
    const at = Date.parse(raw);
    if (Number.isNaN(at)) return RETRY_AFTER_DEFAULT_S;
    seconds = Math.ceil((at - now) / 1000);
  }
  return Math.min(RETRY_AFTER_MAX_S, Math.max(1, seconds));
}

/** The api answered 429: this reader's whole-history budget is spent. */
export class ApiOverBudget extends Error {
  readonly retryAfterSeconds: number;
  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = "ApiOverBudget";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Throws ApiOverBudget when `res` is the api's 429; any other answer passes. */
export function throwIfOverBudget(res: Response, label: string): void {
  if (res.status !== 429) return;
  void res.body?.cancel().catch(() => undefined);
  throw new ApiOverBudget(`${label} answered 429`, parseRetryAfter(res.headers.get("retry-after")));
}

/** A chain route's answer to ApiOverBudget: a 429 with the wait in
 *  `Retry-After`, uncached. */
export function overBudgetResponse(error: ApiOverBudget): Response {
  return Response.json(
    { error: "This reader has asked for more histories than the store answers in a minute", overBudget: true },
    { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds), "Cache-Control": "no-store" } },
  );
}
