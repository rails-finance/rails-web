// One ask of rails-server's at-block routes, with the wait and the down window
// every api-first client shares (rails-ops TO-DO-infra-and-backend.md item 53).
// ----------------------------------------------------------------------------
// A client asks for the answer up to `ROUTE_WAIT_MS` (3 s) so that a slow api
// leaves a server render's 8 s budget (`position-tail-page-data.ts`) time for
// the chain read. After the route fails the key is down for 30 s and the
// client reads the chain without asking. Only a 5xx, a 429, a refused
// connection, a timeout or an unreadable body marks it down; any other 4xx
// (a 400 or 409 refusing the request, a 404 that is the answer "none") marks
// nothing, and `answer` hands its status to a caller that reads one.
//
// SERVER-ONLY.

/** How long a client waits for the route before reading the chain. */
export const ROUTE_WAIT_MS = 3_000;
/** After the route fails, how long the chain is read without asking it. */
const DOWN_MS = 30_000;

/** How long to wait, and a signal that ends the wait sooner. */
export interface AskOpts {
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** A set of routes that fail together: one per client, keyed by whatever fails with the route. */
export function routeGate() {
  const downUntil = new Map<string, number>();
  const markDown = (key: string) => downUntil.set(key, Date.now() + DOWN_MS);
  /** The route's answer: its JSON body on a 2xx, its status on any other
   *  answer, null where it cannot answer (down, unset, refused, slow, unreadable). */
  async function answer<T>(
    key: string,
    url: string,
    init: RequestInit,
    opts: AskOpts = {},
  ): Promise<{ body: T } | { status: number } | null> {
    if (!process.env.RAILS_API_URL || (downUntil.get(key) ?? 0) > Date.now()) return null;
    try {
      const timeout = AbortSignal.timeout(opts.timeoutMs ?? ROUTE_WAIT_MS);
      // No `cache` option: Next 15 caches no fetch by default, and an explicit
      // "no-store" throws its dynamic-usage error inside a static or ISR render,
      // which the catch below took for the route failing, so those pages read the chain.
      const res = await fetch(url, {
        ...init,
        signal: opts.signal ? AbortSignal.any([timeout, opts.signal]) : timeout,
      });
      if (!res.ok) {
        void res.body?.cancel().catch(() => undefined);
        if (res.status >= 500 || res.status === 429) {
          markDown(key);
          return null;
        }
        return { status: res.status };
      }
      return { body: (await res.json()) as T };
    } catch {
      // The caller's own abort (the wallet page's budget) is not the route failing.
      if (!opts.signal?.aborted) markDown(key);
      return null;
    }
  }
  return {
    answer,
    /** The route's JSON answer, or null where it cannot answer or refuses the request. */
    async json<T>(key: string, url: string, init: RequestInit, opts: AskOpts = {}): Promise<T | null> {
      const got = await answer<T>(key, url, init, opts);
      return got && "body" in got ? got.body : null;
    },
  };
}
