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
// During `next build` the same failures throw `RouteDownAtBuild` instead and
// mark nothing: a prerender whose route cannot answer fails (Next retries it,
// `staticGenerationRetryCount` in next.config.ts) rather than reading the chain
// (rails-ops TO-DO-ui-jobs.md item 686). A caller that catches errors around a
// gate call rethrows this one.
//
// Inside a wallet read the fetch takes a slot of the cap every wallet-page
// request to the api host shares (lib/wallet/api-hop.ts, ui-jobs 814),
// released before the caller reads the chain.
//
// SERVER-ONLY.

import { apiSlot } from "@/lib/wallet/api-hop";

/** How long a client waits for the route before reading the chain. */
export const ROUTE_WAIT_MS = 3_000;
/** After the route fails, how long the chain is read without asking it. */
const DOWN_MS = 30_000;

/** A route failure during `next build`, where no caller may read the chain in its place. */
export class RouteDownAtBuild extends Error {
  constructor(key: string, why: string) {
    super(`rails-server route ${key} cannot answer during the build: ${why}`);
    this.name = "RouteDownAtBuild";
  }
}

const atBuild = () => process.env.NEXT_PHASE === "phase-production-build";

/** First in a catch between a gate client and a prerender: rethrows the build's route
 *  failure, so the page fails instead of caching its stub; any other error returns. */
export function rethrowAtBuild(err: unknown): void {
  if (err instanceof RouteDownAtBuild) throw err;
}

/** For an api-first client that asks without a gate: during `next build`, its route
 *  failing (`why`, or the error it threw) throws `RouteDownAtBuild`; otherwise nothing. */
export function throwAtBuild(key: string, why: unknown): void {
  if (why instanceof RouteDownAtBuild) throw why;
  if (atBuild()) throw new RouteDownAtBuild(key, why instanceof Error ? why.message : String(why));
}

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
      // Inside a wallet read the fetch waits for a slot (lib/wallet/api-hop.ts)
      // and holds it until the body is read; the wait starts once it is granted.
      const got = await apiSlot(async (): Promise<{ body: T } | { status: number }> => {
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
          return { status: res.status };
        }
        return { body: (await res.json()) as T };
      }, opts.signal);
      if ("status" in got && (got.status >= 500 || got.status === 429)) {
        if (atBuild()) throw new RouteDownAtBuild(key, `status ${got.status}`);
        markDown(key);
        return null;
      }
      return got;
    } catch (err) {
      // The caller's own abort (the wallet page's budget) is not the route failing.
      if (opts.signal?.aborted) return null;
      if (err instanceof RouteDownAtBuild) throw err;
      if (atBuild()) throw new RouteDownAtBuild(key, (err as Error)?.message ?? String(err));
      markDown(key);
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
