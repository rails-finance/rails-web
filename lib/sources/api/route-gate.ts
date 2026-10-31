// One ask of rails-server's at-block routes, with the wait and the down window
// every api-first client shares (rails-ops TO-DO-infra-and-backend.md item 53).
// ----------------------------------------------------------------------------
// A client asks for the answer up to `ROUTE_WAIT_MS` (3 s) so that a slow api
// leaves a server render's 8 s budget (`position-tail-page-data.ts`) time for
// the chain read. After the route fails the key is down for 30 s and the
// client reads the chain without asking. Only a 5xx, a 429, a refused
// connection, a timeout or an unreadable body marks it down; a 400 or 409
// refuses that one request.
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
  return {
    /** The route's JSON answer, or null where it cannot answer. */
    async json<T>(key: string, url: string, init: RequestInit, opts: AskOpts = {}): Promise<T | null> {
      if (!process.env.RAILS_API_URL || (downUntil.get(key) ?? 0) > Date.now()) return null;
      try {
        const timeout = AbortSignal.timeout(opts.timeoutMs ?? ROUTE_WAIT_MS);
        const res = await fetch(url, {
          ...init,
          cache: "no-store",
          signal: opts.signal ? AbortSignal.any([timeout, opts.signal]) : timeout,
        });
        if (!res.ok) {
          void res.body?.cancel().catch(() => undefined);
          if (res.status >= 500 || res.status === 429) markDown(key);
          return null;
        }
        return (await res.json()) as T;
      } catch {
        // The caller's own abort (the wallet page's budget) is not the route failing.
        if (!opts.signal?.aborted) markDown(key);
        return null;
      }
    },
  };
}
