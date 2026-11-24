// Where a request to the api host is waiting, for a caller that times its wait
// (lib/sources/api/route-gate.ts). The keep-alive pool (lib/api/api-pool.ts)
// marks a request `queued` when the router takes it and `granted` when the
// pool hands it to one of its connections; outside the pool it stays `unsent`.
// A wait that runs out while `queued` was spent behind other requests of this
// process, and the api host has not been asked.
//
// The record travels in an AsyncLocalStorage, so the gate and the pool share
// this module and neither imports the other.
//
// Its one import is node's, so scripts/test/api-pool.test.mjs loads it directly.

import { AsyncLocalStorage } from "node:async_hooks";

export interface PoolWait {
  state: "unsent" | "queued" | "granted";
}

/** Kept on globalThis so every bundle that loads this module in the server
 *  process shares one store with the pool that instrumentation.ts installs. */
const store = ((globalThis as { [k: symbol]: unknown })[Symbol.for("rails.api.poolWait")] ??=
  new AsyncLocalStorage<PoolWait>()) as AsyncLocalStorage<PoolWait>;

/** Run `fn` with a record of where the api-host request it makes is waiting.
 *  `fn` makes one request; with more, the record follows the latest. */
export function withPoolWait<T>(fn: (wait: PoolWait) => Promise<T>): Promise<T> {
  const wait: PoolWait = { state: "unsent" };
  return store.run(wait, () => fn(wait));
}

/** The record of the request being dispatched, where its caller keeps one. */
export const currentPoolWait = (): PoolWait | undefined => store.getStore();
