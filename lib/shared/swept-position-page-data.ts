// The server half of a position page on Base, where the history route decides
// per request whether the index can answer or the chain has to be swept — Aave
// V3 on Base, Seamless, and Compound V3 on Base.
// ----------------------------------------------------------------------------
// SERVER-ONLY. Imported only from those pages' server components.
//
// The rule is neither head nor tail: what belongs on the server is whatever can
// answer inside the request. Measured against the live backend:
//
//   Pool read (one multicall burst)     under a second   → server
//   history, INDEXED and whole          0.2-0.8s         → server
//   history, swept from the Pool's logs 3-30s            → stays on the client
//
// Both legs are read, and the history's leg is conditional on the answer coming
// from the index. /api/chain/<proto>/timeline serves the index when the index
// can vouch for the whole life and sweeps the Pool's own logs otherwise, and
// this loader asks the same question through the same reader — so the two can
// never disagree about which store answered.
//
// The condition is a property of the deployment (the backfill has reached the
// Sieve checkpoint, aToken transfers captured) with one per-wallet exception:
// a history long enough to hit the row ceiling is not whole, and that wallet
// falls through to a sweep. So `whole` is checked rather than assumed, and a
// wallet that fails it gets NO timeline seed — not a timed-out one. Waiting out
// a budget we already know will be missed would cost the reader the wait AND
// leave the client starting the sweep from zero.
//
// This is the measurement the Moonwell Base loader named as its re-take
// condition, taken. Moonwell's index still cannot vouch, so its history stays
// on the client; these two Pools' can, so it does not.
//
// Both reads call their loaders directly rather than this deployment's own
// /api/chain/<proto>/* routes: those handlers run exactly these lines, so going
// through them would buy a hop and a second function invocation and nothing
// else. (Contrast the Liquity forks, whose proxies narrow rows and price them —
// there the route is not a pass-through and has to be used.)
//
// Nothing here throws: on any failure the caller gets nulls and the client half
// fetches for itself, exactly as it did before this route had a server half.

import { cache } from "react";
import { loadAaveV3PositionFromChain } from "@/lib/sources/chain/aave-v3-position";
import { loadAaveV3EventsFromIndex } from "@/lib/sources/api/aave-v3-base-timeline";
import { toTimelineWire } from "@/lib/shared/timeline-wire";
import { readerIpFromHeaders } from "@/lib/api/reader-ip-server";
import type { AaveV3PositionChainResponse } from "@/lib/api/fetch-aave-v3-position";
import type { ChainId } from "@/lib/shared/chains";

// Bound the server wait, well inside the platform's function timeout. Both legs
// measure under a second; one that blows this budget is a throttled RPC or a
// struggling backend, and a fast unseeded first paint beats a 503.
const READ_TIMEOUT_MS = 6000;

export interface V3PoolPositionTail {
  /** The Pool's own read of the account. `null` when it failed, or answered
   *  with its `chainStale` stub — the client then reads it for itself. */
  position: AaveV3PositionChainResponse | null;
  /** The history in the lean wire shape the route sends over HTTP, so the
   *  client rehydrates the seed through exactly the code path it would have
   *  used for a fetched one. `null` when the index cannot vouch for the whole
   *  life (the client sweeps) or the read failed. */
  timeline: unknown | null;
}

const EMPTY: V3PoolPositionTail = { position: null, timeline: null };

async function withTimeout<T>(p: Promise<T>, label: string): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          console.error(`${label} exceeded ${READ_TIMEOUT_MS}ms`);
          resolve(null);
        }, READ_TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    console.error(`${label} failed`, err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The general shape: a HEAD read, and a history that is seeded only when it came
 * from the index. Both bounded by the same budget and run in parallel; neither
 * throws.
 */
export function sweptPositionLoader<Head>(opts: {
  label: string;
  /** The protocol's own state read for this subject. Return null for a read
   *  that failed or came back as a stale stub — the client then reads it. */
  readHead: (subject: string) => Promise<Head | null>;
  /** The history in the route's wire shape, but ONLY when the index vouches for
   *  every block of it. Return null otherwise; the client sweeps. `readerIp`
   *  is the current reader's, for a leg that calls the box directly — see
   *  lib/api/reader-ip-server.ts. */
  readWholeIndexedHistory: (subject: string, readerIp?: string) => Promise<unknown | null>;
}) {
  return cache(async (subject: string): Promise<{ head: Head | null; timeline: unknown | null }> => {
    try {
      const readerIp = await readerIpFromHeaders();
      const [head, timeline] = await Promise.all([
        withTimeout(opts.readHead(subject), `${opts.label} position page: head read`),
        withTimeout(
          opts.readWholeIndexedHistory(subject, readerIp),
          `${opts.label} position page: indexed history read`,
        ),
      ]);
      return { head: head ?? null, timeline: timeline ?? null };
    } catch (err) {
      console.error(`${opts.label} position page: read failed; client will fetch`, err);
      return { head: null, timeline: null };
    }
  });
}

/**
 * A loader for one Pool. `pool` and `chainId` are the same pair the protocol's
 * /api/chain/<proto>/position route passes, so the two cannot describe
 * different markets.
 *
 * Wrapped in React `cache` so `generateMetadata` and the page body share one
 * read per request. `wallet` must already be a well-formed address — the page
 * turns anything else away with a 404 rather than letting viem's `getAddress`
 * throw through the render.
 */
export function v3PoolPositionLoader(opts: {
  label: string;
  pool: string;
  chainId: ChainId;
  /** This deployment's own backend prefix on rails-server, e.g.
   *  `/api/seamless` — the same one its timeline route passes. */
  apiPrefix: string;
  /** The Pool's first block; the history's claim to being a whole life. */
  deployBlock: number;
}) {
  return cache(async (wallet: string): Promise<V3PoolPositionTail> => {
    try {
      const readerIp = await readerIpFromHeaders();
      const [position, timeline] = await Promise.all([
        withTimeout(
          loadAaveV3PositionFromChain(wallet, opts.pool, undefined, opts.chainId),
          `${opts.label} position page: Pool read`,
        ),
        withTimeout(
          readWholeIndexedHistory(opts, wallet, readerIp),
          `${opts.label} position page: indexed history read`,
        ),
      ]);
      return {
        // `chainStale` is the reader's own "the RPC failed and this is a stub".
        // Seeding the client with that would paint an untouched position as a
        // read one, so it counts as no read at all.
        position: position && !position.chainStale ? position : null,
        timeline: timeline ?? null,
      };
    } catch (err) {
      console.error(`${opts.label} position page: read failed; client will fetch`, err);
      return EMPTY;
    }
  });
}

/** The history, but ONLY when the index vouches for every block of it — or
 *  when the wallet is HEAVY, where the index's stated horizon IS the answer
 *  the route serves and a sweep would reach a shallower one. A partial index
 *  is not a shorter answer — the page's lifetime totals, peaks and "whole
 *  life" footer are all claims about completeness — so any other `whole:
 *  false` verdict returns nothing and the client's fetch takes the route's
 *  sweep branch, which is what would have happened anyway. The horizon
 *  travels in the coverage the wire carries, and the page's own `sweptClean`
 *  gate reads it: a seeded heavy answer withholds exactly what a fetched one
 *  does. */
async function readWholeIndexedHistory(
  opts: { label: string; chainId: ChainId; apiPrefix: string; deployBlock: number },
  wallet: string,
  readerIp?: string,
): Promise<unknown | null> {
  const indexed = await loadAaveV3EventsFromIndex(
    {
      wallet,
      chainId: opts.chainId,
      apiPrefix: opts.apiPrefix,
      deployBlock: opts.deployBlock,
    },
    readerIp,
  ).catch((e: unknown) => {
    // The index being unreachable is a reason to let the client sweep, not to
    // forfeit the position seed beside it.
    console.error(`${opts.label} position page: index read failed`, e);
    return null;
  });
  if (!indexed?.whole && !indexed?.heavy) {
    if (indexed) console.warn(`${opts.label} position page: index not whole for ${wallet} (${indexed.reason})`);
    return null;
  }
  if (indexed.heavy) console.warn(`${opts.label} position page: heavy wallet ${wallet} (${indexed.reason})`);
  return toTimelineWire(indexed.result, opts.chainId);
}
