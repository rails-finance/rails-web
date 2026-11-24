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
// is 1); the pool opens a fresh connection for the next. A GET or HEAD that
// fails at the socket before any response headers arrive (a keep-alive socket
// gone stale while a Vercel instance was frozen) is sent once more
// (`retryStaleSocket`). Past that, the wallet page's retry
// (lib/wallet/api-hop.ts) and the route gate's chain fallback handle the
// request as before.
//
// A response's body holds its connection until the body is read to the end
// or cancelled, so a call site reads or cancels every body, including the one
// it drops on a non-2xx (`void res.body?.cancel().catch(() => undefined)`).
// Six unread bodies leave every other request to the api host queued.
//
// The router marks a request's wait (lib/api/pool-wait.ts) `queued` when it
// takes it and `granted` when the pool hands it to a connection, so the route
// gate can tell a wait spent in this queue from a slow api.
//
// SERVER-ONLY: instrumentation.ts installs it once per server process, and no
// other module imports it. It imports undici and ./pool-wait, so
// scripts/test/api-pool.test.mjs loads it with a hook that adds the .ts.

import { Client, Dispatcher, Pool, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { currentPoolWait } from "./pool-wait";

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

/** The pause before a stale socket's request is sent again (ms). */
export const STALE_RETRY_DELAY_MS = 10;

const STALE_SOCKET_CODES = new Set(["UND_ERR_SOCKET", "ECONNRESET"]);
const IDEMPOTENT = new Set(["GET", "HEAD"]);

/** Sends a request again, once, where its socket failed before any response
 *  headers arrived. Every other outcome passes to `handler` unchanged. */
class RetryStaleSocket implements Dispatcher.DispatchHandler {
  #answered = false;
  #retried = false;
  readonly #dispatch: Dispatcher.Dispatch;
  readonly #opts: Dispatcher.DispatchOptions;
  readonly #handler: Dispatcher.DispatchHandler;

  constructor(dispatch: Dispatcher.Dispatch, opts: Dispatcher.DispatchOptions, handler: Dispatcher.DispatchHandler) {
    this.#dispatch = dispatch;
    this.#opts = opts;
    this.#handler = handler;
  }

  onRequestStart(controller: Dispatcher.DispatchController, context: unknown): void {
    this.#handler.onRequestStart?.(controller, context);
  }

  onRequestUpgrade(...args: Parameters<NonNullable<Dispatcher.DispatchHandler["onRequestUpgrade"]>>): void {
    this.#handler.onRequestUpgrade?.(...args);
  }

  onResponseStart(...args: Parameters<NonNullable<Dispatcher.DispatchHandler["onResponseStart"]>>): void {
    this.#answered = true;
    this.#handler.onResponseStart?.(...args);
  }

  onResponseData(...args: Parameters<NonNullable<Dispatcher.DispatchHandler["onResponseData"]>>): void {
    this.#handler.onResponseData?.(...args);
  }

  onResponseEnd(...args: Parameters<NonNullable<Dispatcher.DispatchHandler["onResponseEnd"]>>): void {
    this.#handler.onResponseEnd?.(...args);
  }

  onResponseError(controller: Dispatcher.DispatchController, err: Error): void {
    const code = (err as { code?: string }).code;
    if (this.#answered || this.#retried || controller.aborted || !code || !STALE_SOCKET_CODES.has(code)) {
      this.#handler.onResponseError?.(controller, err);
      return;
    }
    this.#retried = true;
    setTimeout(() => {
      try {
        this.#dispatch(this.#opts, this);
      } catch (e) {
        this.#handler.onResponseError?.(controller, e as Error);
      }
    }, STALE_RETRY_DELAY_MS);
  }
}

/** An interceptor that sends a GET or HEAD once more where it failed with
 *  UND_ERR_SOCKET or ECONNRESET before any response headers arrived. Other
 *  methods, later failures and every status code pass through. */
export const retryStaleSocket: Dispatcher.DispatcherComposeInterceptor = (dispatch) => (opts, handler) =>
  IDEMPOTENT.has(opts.method) ? dispatch(opts, new RetryStaleSocket(dispatch, opts, handler)) : dispatch(opts, handler);

/** The mark the router sets on a request's options: called when the pool
 *  hands the request to a connection. */
const ON_GRANT = Symbol("rails.api.onGrant");
type GrantOptions = Dispatcher.DispatchOptions & { [ON_GRANT]?: () => void };

/** One of the pool's connections. The pool calls `dispatch` when it hands a
 *  request over, straight away where a connection is free and otherwise when
 *  one frees. */
class GrantingClient extends Client {
  dispatch(opts: Dispatcher.DispatchOptions, handler: Dispatcher.DispatchHandler): boolean {
    (opts as GrantOptions)[ON_GRANT]?.();
    return super.dispatch(opts, handler);
  }
}

/** The pool for `origin`: at most `connections` sockets, one request on each
 *  at a time, with a stale socket's GET or HEAD retried once. */
export function createApiPool(origin: string, opts: ApiPoolOptions = {}): Dispatcher {
  const keepAlive = opts.keepAliveMs ?? API_KEEPALIVE_MS;
  return new Pool(origin, {
    connections: opts.connections ?? API_CONNECTIONS,
    pipelining: 1,
    keepAliveTimeout: keepAlive,
    keepAliveMaxTimeout: keepAlive,
    factory: (url, clientOpts) => new GrantingClient(url, clientOpts),
  }).compose(retryStaleSocket);
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
    if (originOf(opts.origin) !== this.origin) return this.rest.dispatch(opts, handler);
    const wait = currentPoolWait();
    if (!wait) return this.pool.dispatch(opts, handler);
    wait.state = "queued";
    const marked: GrantOptions = {
      ...opts,
      [ON_GRANT]: () => {
        wait.state = "granted";
      },
    };
    return this.pool.dispatch(marked, handler);
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
