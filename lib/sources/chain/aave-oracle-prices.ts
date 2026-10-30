// Aave-family on-chain oracle prices (Aave V3, SparkLend) — server-only.
// ----------------------------------------------------------------------------
// Every Aave-family market prices its reserves through an IAaveOracle deployment:
// `getAssetPrice(asset)` returns the asset's value in the market's base currency,
// which is USD scaled to 8 decimals (BASE_CURRENCY_UNIT = 1e8) on mainnet for
// both Aave V3 and SparkLend. This is the SAME oracle the Pool reads to price
// collateral and compute health factors, so the USD it yields is CHAIN-DERIVED —
// it survives the chain-state gate, unlike a DefiLlama market cache.
//
// Simpler than Comet's reader (lib/sources/chain/compound-prices.ts): the Aave
// oracle maps an asset address straight to a price, so there is no per-token feed
// resolution step — one batched multicall of getAssetPrice over every distinct
// (oracle, asset) pair on the page.
//
// `chainId` selects which chain's RPC the multicall goes to, and defaults to
// Ethereum so every existing L1 call site reads exactly as before. The oracle
// ADDRESS still selects the market — passing a Base oracle with the Ethereum
// default would resolve nothing rather than mis-price, but the two are meant to
// travel together.
//
// The answer comes from rails-server's `/api/at-block/aave-v3/oracle-prices`
// (rails-ops decisions/0056). Asked with no block, as here, it answers
// getAssetPrice at the chain's latest block, read on a keyless gateway first
// and kept 30 s in the api per oracle and asset set; asked at a block, from
// Sieve's stored rounds and the at-block store. The multicall below answers
// only when that route cannot (no RAILS_API_URL, an oracle it does not serve,
// a failed request).
//
// SERVER-ONLY — imported from /api/* route handlers only (it calls the chain via
// lib/sources/chain/rpc). Mirrors the batched-multicall shape of compound-prices.

import { parseAbi } from "viem";
import { chainClient } from "./rpc";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";

/** The server's market key per AaveOracle, as its AAVE_V3_POSITION_MARKETS names them. */
const SERVER_MARKET: Record<string, string> = {
  "0x54586be62e3c3580375ae3723c145253060ca0c2": "core",
  "0xe3c061981870c0c7b1f3c4f4bb36b95f1f260be6": "prime",
  "0x43b64f28a678944e0655404b0b98e443851cc34f": "etherfi",
  "0x8105f69d9c41644c6a0803fda7d03aa70996cfd9": "spark",
  "0x2cc0fc26ed4563a5ce5e8bdcfe1a2878676ae156": "base",
  "0xfdd4e83890bccd1fbf9b10d71a5cc0a738753b01": "seamless",
  "0xb56c2f0b653b2e0b10c9b928c8580ac5df02c7c7": "arbitrum",
};
/** The server route's limit on assets a request. */
const SERVER_MAX_ASSETS = 40;

/** One oracle's prices from the server route, raw (8 decimals) by asset; null when the route cannot answer. */
async function serverPrices(oracle: string, assets: string[]): Promise<Map<string, bigint> | null> {
  const market = SERVER_MARKET[oracle];
  const api = process.env.RAILS_API_URL;
  if (!market || !api) return null;
  const out = new Map<string, bigint>();
  try {
    for (let i = 0; i < assets.length; i += SERVER_MAX_ASSETS) {
      const qs = new URLSearchParams({ market, assets: assets.slice(i, i + SERVER_MAX_ASSETS).join(",") });
      const res = await fetch(`${api}/api/at-block/aave-v3/oracle-prices?${qs.toString()}`, {
        ...createAuthFetchOptions(),
        cache: "no-store",
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { prices?: Record<string, string> };
      for (const [a, v] of Object.entries(body.prices ?? {})) out.set(a.toLowerCase(), BigInt(v));
    }
  } catch {
    return null;
  }
  return out;
}

const AAVE_ORACLE_ABI = parseAbi(["function getAssetPrice(address asset) view returns (uint256)"]);

/** IAaveOracle returns USD with 8 decimals (BASE_CURRENCY_UNIT) — checked on
 *  each deployment this reads: Aave V3 and SparkLend on Ethereum, and the Aave
 *  V3 Base Pool's oracle, whose BASE_CURRENCY is the zero address and whose
 *  BASE_CURRENCY_UNIT is 1e8. */
const PRICE_SCALE = 1e8;

export interface AaveOraclePriceRequest {
  /** The market's IAaveOracle proxy — V3 core and SparkLend each have their own. */
  oracle: string;
  /** Underlying reserve token addresses to price. */
  assets: string[];
}

/** Keyed by `${oracle}:${asset}` (both lowercased) → USD price per whole token.
 *  Keyed per-oracle because each market prices through its own oracle. */
export type AaveOraclePriceMap = Map<string, number>;

const priceKey = (oracle: string, asset: string) => `${oracle.toLowerCase()}:${asset.toLowerCase()}`;

/** Look up a resolved price for one (oracle, asset). */
export function aaveOraclePriceOf(map: AaveOraclePriceMap, oracle: string, asset: string): number | undefined {
  return map.get(priceKey(oracle, asset));
}

/** Resolve on-chain oracle USD prices for every (oracle, asset) across the page,
 *  batched into a single multicall. A missing RPC config or a failed read simply
 *  omits that asset — callers must treat an absent price as "unpriced" and degrade
 *  (never assert a partial total). */
export async function resolveAaveOraclePrices(
  reqs: AaveOraclePriceRequest[],
  chainId: ChainId = MAINNET_CHAIN_ID,
): Promise<AaveOraclePriceMap> {
  const out: AaveOraclePriceMap = new Map();
  if (reqs.length === 0) return out;

  // The distinct (oracle, asset) pairs we need a price for.
  const pairs: { oracle: string; asset: string }[] = [];
  const seen = new Set<string>();
  for (const r of reqs) {
    const oracle = r.oracle.toLowerCase();
    for (const a of r.assets) {
      if (!a) continue;
      const asset = a.toLowerCase();
      const k = priceKey(oracle, asset);
      if (seen.has(k)) continue;
      seen.add(k);
      pairs.push({ oracle, asset });
    }
  }
  if (pairs.length === 0) return out;

  // The server route first, one request per oracle (chunked); an oracle it
  // cannot answer is read at the head below.
  const byOracle = new Map<string, string[]>();
  for (const p of pairs) (byOracle.get(p.oracle) ?? byOracle.set(p.oracle, []).get(p.oracle)!).push(p.asset);
  const answered = new Set<string>();
  await Promise.all(
    [...byOracle].map(async ([oracle, assets]) => {
      const got = await serverPrices(oracle, assets);
      if (!got) return;
      answered.add(oracle);
      for (const a of assets) {
        const v = got.get(a);
        if (v != null && v > BigInt(0)) out.set(priceKey(oracle, a), Number(v) / PRICE_SCALE);
      }
    }),
  );
  const chainPairs = pairs.filter((p) => !answered.has(p.oracle));
  if (chainPairs.length === 0) return out;

  let client: ReturnType<typeof chainClient>;
  try {
    client = chainClient(chainId);
  } catch {
    // That chain's RPC env var is unset — no on-chain USD; callers stay
    // token-only, which is what an absent price already means to them.
    return out;
  }

  let results: unknown[] = [];
  try {
    results = (await client.multicall({
      allowFailure: true,
      contracts: chainPairs.map(
        (p) =>
          ({
            address: p.oracle as `0x${string}`,
            abi: AAVE_ORACLE_ABI,
            functionName: "getAssetPrice",
            args: [p.asset as `0x${string}`],
          }) as const,
      ),
    })) as unknown[];
  } catch {
    results = [];
  }

  chainPairs.forEach((p, i) => {
    const res = results[i] as { status: string; result?: unknown } | undefined;
    if (res?.status !== "success" || res.result == null) return;
    const usd = Number(res.result as bigint) / PRICE_SCALE;
    if (usd > 0) out.set(priceKey(p.oracle, p.asset), usd);
  });

  return out;
}
