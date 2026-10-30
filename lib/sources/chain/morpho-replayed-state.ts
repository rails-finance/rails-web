// Morpho Blue reads the api answers instead of the chain (rails-ops decisions/0056).
// ----------------------------------------------------------------------------
//   readReplayedMarkets  every market's market(id) fields at one block, replayed
//                        by rails-server: on Base from the Base Sieve
//                        (`/api/morpho-base/market-state`), on Ethereum from
//                        victoria's mainnet Sieve by morpho-processor
//                        (`/api/morpho/market-state`), the latter only with
//                        MORPHO_ETH_SUPPLY_REPLAY on in this process's env (off
//                        by default; the api answers 404 until the worker's flag
//                        of the same name is on). A market the replay cannot
//                        settle is in `unreplayed`; the caller reads those, and
//                        any market missing from the answer, on chain.
//   readOracleViaApi     a market oracle's price() and its feeds' rounds at a
//                        block (`/api/at-block/morpho/oracle`), keyless first and
//                        kept 30 s by the api: readOracle's answer.
//
// Each returns null on any failure, and the caller falls back to its chain read.
// SERVER-ONLY.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { BASE_CHAIN_ID, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import type { MorphoOracleFeed } from "@/lib/api/fetch-morpho-position";

const RAILS_API_URL = process.env.RAILS_API_URL;
const TIMEOUT_MS = 6_000;
/** The api keeps the state 30 s; so does this process. */
const TTL_MS = 30_000;

/** market(id)'s six fields, as viem decodes them. */
export type MarketTuple = readonly [bigint, bigint, bigint, bigint, bigint, bigint];

export interface ReplayedMarkets {
  blockNumber: number;
  /** Keyed by the 0x-prefixed lowercase id. */
  states: Map<string, MarketTuple>;
}

interface StateBody {
  blockNumber: number;
  markets: [string, string, string, string, string, string, string][];
  unreplayed: string[];
}

/** The Ethereum switch: on, 1 or true. */
const ETH_REPLAY = /^(on|1|true)$/i.test(process.env.MORPHO_ETH_SUPPLY_REPLAY ?? "");

/** The api route that replays `chainId`'s markets, or null where none is switched on. */
function routeFor(chainId: ChainId): string | null {
  if (chainId === BASE_CHAIN_ID) return "/api/morpho-base/market-state";
  if (chainId === MAINNET_CHAIN_ID && ETH_REPLAY) return "/api/morpho/market-state";
  return null;
}

const memo = new Map<string, { at: number; value: Promise<ReplayedMarkets | null> }>();

async function fetchState(route: string, query: string): Promise<ReplayedMarkets | null> {
  if (!RAILS_API_URL) return null;
  const res = await fetch(
    `${RAILS_API_URL}${route}${query}`,
    createAuthFetchOptions({ cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) }),
  );
  if (!res.ok) throw new Error(`${route} answered ${res.status}`);
  const body = (await res.json()) as StateBody;
  if (!(body.blockNumber > 0) || !Array.isArray(body.markets)) throw new Error("market-state answered no block");
  const states = new Map<string, MarketTuple>();
  for (const [id, ...v] of body.markets) {
    states.set(`0x${id}`, v.map((x) => BigInt(x)) as unknown as MarketTuple);
  }
  return { blockNumber: body.blockNumber, states };
}

/** Every replayed market on `chainId` (Base; Ethereum behind its switch), or one market with `id`. */
export async function readReplayedMarkets(chainId: ChainId, id?: string): Promise<ReplayedMarkets | null> {
  const route = routeFor(chainId);
  if (!route) return null;
  const run = (q: string) =>
    fetchState(route, q).catch((err: unknown) => {
      console.error("morpho market state: api read failed, reading the chain:", err);
      return null;
    });
  if (id) return run(`?ids=${id.replace(/^0x/, "").toLowerCase()}`);
  const hit = memo.get(route);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const entry = { at: Date.now(), value: run("") };
  memo.set(route, entry);
  const value = await entry.value;
  if (value == null && memo.get(route) === entry) memo.delete(route);
  return value;
}

export interface OracleViaApi {
  block: number;
  timestamp: number;
  /** Null where price() reverts. */
  price: bigint | null;
  feeds: MorphoOracleFeed[] | null;
}

/** The oracle's price and feeds at `block` from the api, or null (the caller reads the chain). */
export async function readOracleViaApi(chainId: ChainId, oracle: string, block?: bigint): Promise<OracleViaApi | null> {
  if (!RAILS_API_URL || (chainId !== MAINNET_CHAIN_ID && chainId !== BASE_CHAIN_ID)) return null;
  try {
    const q = new URLSearchParams({ chain: String(chainId), oracle: oracle.toLowerCase() });
    if (block != null) q.set("block", block.toString());
    const res = await fetch(
      `${RAILS_API_URL}/api/at-block/morpho/oracle?${q}`,
      createAuthFetchOptions({ cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) }),
    );
    if (!res.ok) throw new Error(`/api/at-block/morpho/oracle answered ${res.status}`);
    const body = (await res.json()) as {
      block: number;
      timestamp: number;
      price: string | null;
      feeds: MorphoOracleFeed[] | null;
    };
    return {
      block: body.block,
      timestamp: body.timestamp,
      price: body.price == null ? null : BigInt(body.price),
      feeds: body.feeds,
    };
  } catch (err) {
    console.error("morpho oracle: api read failed, reading the chain:", err);
    return null;
  }
}
