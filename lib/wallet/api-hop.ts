// Every request the wallet page makes to the api host (ui-jobs 813, 814). The
// host resets bursts of new TLS handshakes from one address, so the server
// process keeps at most API_CONCURRENCY of them open at once: the summary and
// listing reads, each family's head read, the families read at visit and the
// Liquidity section share one queue. A request whose connection failed before
// any answer is tried once more where no chain read stands behind it (apiHop);
// an HTTP answer, whatever its status, is an answer and is not retried.
//
// A shared client that other pages also call (route-gate.ts, the listing
// proxies, the token-metadata route) takes a slot through `apiSlot`, which
// queues only inside a wallet read (`inWalletRead`) and holds the slot around
// the fetch, so a chain fallback runs after it is released. A request made
// while its caller already holds a slot runs in that slot. Past the wallet
// read's deadline a request is refused when its turn comes, without a fetch.
//
// The queue has two lanes. Each family's head read, each row of a per-row head
// read and each module read at visit is a chain (`inChain`); once one of a
// chain's requests has had a slot, its later requests take the priority lane,
// which a freed slot serves before the normal lane.
//
// A limiter in plain code holds whatever fetch each reader calls. Next's
// server fetch wraps undici, and a shared Agent passed to it as `dispatcher`
// is not a stable contract across Next releases.
//
// Its one import is node's, so scripts/test/wallet-api-hop.test.mjs loads it directly.

import { AsyncLocalStorage } from "node:async_hooks";

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
 *  the order given within each of two lanes. A finishing job hands its slot
 *  straight to the oldest job waiting in the priority lane, else to the oldest
 *  in the normal lane, so no newcomer takes it between; a job whose `signal`
 *  aborts while it waits leaves its lane and rejects. */
export function createLimiter(max: number) {
  let running = 0;
  const normal: { go: () => void }[] = [];
  const priority: { go: () => void }[] = [];
  const release = () => {
    const next = priority.shift() ?? normal.shift();
    if (next) next.go();
    else running--;
  };
  const acquire = (signal?: AbortSignal, first = false): Promise<void> => {
    if (signal?.aborted) return Promise.reject(abortError(signal));
    if (running < max && normal.length === 0 && priority.length === 0) {
      running++;
      return Promise.resolve();
    }
    const lane = first ? priority : normal;
    return new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        const i = lane.indexOf(entry);
        if (i >= 0) lane.splice(i, 1);
        reject(abortError(signal!));
      };
      const entry = {
        go: () => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        },
      };
      lane.push(entry);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  };
  /** `fn` once a slot is free; `first` queues it in the priority lane. */
  return async function limit<T>(fn: () => Promise<T>, signal?: AbortSignal, first = false): Promise<T> {
    await acquire(signal, first);
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

/** One chain of requests inside a wallet read (a family's head read, a row's,
 *  a module read at visit): `served` once one of its requests has had a slot. */
interface ChainMark {
  served: boolean;
}

/** What a wallet read carries down its calls: whether this call already holds
 *  a slot, when the read gives up (epoch ms), and the chain it belongs to. */
interface WalletScope {
  holding: boolean;
  deadline?: number;
  chain?: ChainMark;
}

/** The one queue and the wallet read's context, kept on globalThis so every
 *  bundle that loads this module in the server process shares them. */
const shared = ((globalThis as { [k: symbol]: unknown })[Symbol.for("rails.wallet.apiCap")] ??= {
  limit: createLimiter(API_CONCURRENCY),
  scope: new AsyncLocalStorage<WalletScope>(),
}) as { limit: ReturnType<typeof createLimiter>; scope: AsyncLocalStorage<WalletScope> };

/** Run `fn` as part of a wallet read that gives up at `deadline` (epoch ms):
 *  api-host requests it makes through `apiSlot` queue behind the cap, and
 *  none is made once the deadline has passed. */
export function inWalletRead<T>(fn: () => Promise<T>, deadline?: number): Promise<T> {
  return shared.scope.run({ holding: false, deadline }, fn);
}

/** Run `fn` as a chain of its own inside the wallet read: its requests after
 *  the first queue in the priority lane. Outside a wallet read `fn` runs as is. */
export function inChain<T>(fn: () => Promise<T>): Promise<T> {
  const store = shared.scope.getStore();
  if (!store) return fn();
  return shared.scope.run({ ...store, chain: { served: false } }, fn);
}

const PAST_DEADLINE = "PastReadDeadline";

/** Whether `err` is a request refused because its wallet read had given up:
 *  the route did not fail, so nothing marks it down. */
export const isPastReadDeadline = (err: unknown): boolean => (err as { name?: string } | null)?.name === PAST_DEADLINE;

const pastDeadline = () => Object.assign(new Error("the wallet read's deadline has passed"), { name: PAST_DEADLINE });

/** `fn` in a slot: queued behind the cap (leaving the queue where `signal`
 *  aborts) and run once granted, so a budget it sets runs from then. Past the
 *  read's deadline it is refused, before the queue or when its turn comes,
 *  and frees the slot at once. A call already holding a slot runs at once. A
 *  call whose chain has been served queues in the priority lane.
 *
 *  A slot callback makes one request and must not fan out: an apiSlot or
 *  apiHop call inside it inherits `holding` and runs uncapped. */
function inSlot<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const store = shared.scope.getStore();
  if (store?.holding) return fn();
  const deadline = store?.deadline;
  const chain = store?.chain;
  const past = () => deadline != null && Date.now() >= deadline;
  if (past()) return Promise.reject(pastDeadline());
  return shared.limit(
    async () => {
      if (past()) throw pastDeadline();
      try {
        return await shared.scope.run({ holding: true, deadline, chain }, fn);
      } finally {
        if (chain) chain.served = true;
      }
    },
    signal,
    chain?.served === true,
  );
}

/** One request to the api host from a client other pages share: inside a
 *  wallet read it takes a slot for `fn`, which is the fetch and its body; anywhere
 *  else `fn` runs as before. No retry: the caller may read the chain in its
 *  place. */
export function apiSlot<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  return shared.scope.getStore() ? inSlot(fn, signal) : fn();
}

/** One wallet-page request to the api host with no chain read behind it:
 *  always in a slot, and retried once on a connection failure. */
export function apiHop<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  return inSlot(() => retryOnConnectionFailure(fn, signal), signal);
}
