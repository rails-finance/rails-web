// One keep-alive pool for every server fetch to the api host (rails-ops
// ui-jobs 825). kings-cross resets bursts of new TLS handshakes from one
// address (9 at once from one Mac: 0 to 5 reset; ui-jobs 813 and 814 run with
// at most 4 at once), so the server process holds at most API_CONNECTIONS
// connections to the api origin and keeps them open between requests. A burst
// of reads queues on those connections and opens no new handshakes once they
// are warm.
//
// The pool sits under the process's global undici dispatcher, which Node's
// fetch reads on every request: a router sends the api origin to the pool and
// every other origin (chain RPC, Vercel) to the dispatcher that was global
// before. Next's patched fetch, its data cache (`next: { revalidate }`) and its
// request dedupe run above `globalThis.fetch` and are untouched; a cache hit
// opens no connection. Call sites change nothing: the headers-only clients
// (`createAuthHeaders`, `routeBoxHop`) and the `createAuthFetchOptions` ones go
// through the pool alike.
//
// A connection the host resets fails the one request it carried (pipelining
// is 1); the pool opens a fresh connection for the next. The wallet page's
// retry (lib/wallet/api-hop.ts) and the route gate's chain fallback handle that
// request as before.
//
// SERVER-ONLY: instrumentation.ts installs it once per server process, and no
// other module imports it. Its one import is undici, so
// scripts/test/api-pool.test.mjs loads it directly.

import { Dispatcher, Pool, getGlobalDispatcher, setGlobalDispatcher } from "undici";

/** At most this many open connections to the api host per server process.
 *  Above 814's wallet cap of 4, so a wallet read leaves a render on the same
 *  instance two connections, and below the bursts of 9 new handshakes in
 *  which kings-cross reset up to 5. */
export const API_CONNECTIONS = 6;

/** How long an idle connection stays open (ms). Well inside Caddy's default
 *  idle timeout of 5 minutes, so the client closes an idle connection before
 *  the host does and a request seldom lands on one the host has dropped. */
export const API_KEEPALIVE_MS = 30_000;

export interface ApiPoolOptions {
  connections?: number;
  keepAliveMs?: number;
}

/** The pool for `origin`: at most `connections` sockets, one request on each at a time. */
export function createApiPool(origin: string, opts: ApiPoolOptions = {}): Pool {
  const keepAlive = opts.keepAliveMs ?? API_KEEPALIVE_MS;
  return new Pool(origin, {
    connections: opts.connections ?? API_CONNECTIONS,
    pipelining: 1,
    keepAliveTimeout: keepAlive,
    keepAliveMaxTimeout: keepAlive,
  });
}

const originOf = (o: unknown): string | undefined => {
  if (typeof o === "string") {
    try {
      return new URL(o).origin;
    } catch {
      return undefined;
    }
  }
  return o instanceof URL ? o.origin : undefined;
};

/** A dispatcher that sends requests for `origin` to `pool` and the rest to `rest`. */
export class OriginRouter extends Dispatcher {
  readonly origin: string;
  readonly pool: Dispatcher;
  readonly rest: Dispatcher;

  constructor(origin: string, pool: Dispatcher, rest: Dispatcher) {
    super();
    this.origin = origin;
    this.pool = pool;
    this.rest = rest;
  }

  dispatch(opts: Dispatcher.DispatchOptions, handler: Dispatcher.DispatchHandler): boolean {
    const target = originOf(opts.origin) === this.origin ? this.pool : this.rest;
    return target.dispatch(opts, handler);
  }

  /** Closes the pool; the dispatcher for other origins belongs to the process. */
  close(): Promise<void>;
  close(callback: () => void): void;
  close(callback?: () => void): Promise<void> | void {
    const done = this.pool.close();
    if (!callback) return done;
    done.then(callback, callback);
  }

  destroy(): Promise<void>;
  destroy(err: Error | null): Promise<void>;
  destroy(callback: () => void): void;
  destroy(err: Error | null, callback: () => void): void;
  destroy(a?: Error | null | (() => void), b?: () => void): Promise<void> | void {
    const err = typeof a === "function" ? null : (a ?? null);
    const callback = typeof a === "function" ? a : b;
    const done = this.pool.destroy(err);
    if (!callback) return done;
    done.then(callback, callback);
  }
}

const INSTALLED = Symbol.for("rails.api.pool");

/** Route the process's fetches to `apiUrl`'s origin through one keep-alive
 *  pool. Once per process: a later call returns the router already installed.
 *  Without an api URL it installs nothing. */
export function installApiPool(apiUrl: string | undefined, opts: ApiPoolOptions = {}): OriginRouter | undefined {
  const g = globalThis as { [INSTALLED]?: OriginRouter };
  if (g[INSTALLED]) return g[INSTALLED];
  const origin = originOf(apiUrl);
  if (!origin) return undefined;
  const router = new OriginRouter(origin, createApiPool(origin, opts), getGlobalDispatcher());
  setGlobalDispatcher(router);
  g[INSTALLED] = router;
  return router;
}
