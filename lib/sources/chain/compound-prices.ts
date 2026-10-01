// Compound V3 (Comet) on-chain oracle prices — server-only.
// ----------------------------------------------------------------------------
// Comet prices every asset it lists through its OWN price feeds (the same
// Chainlink feeds its liquidation engine reads): `getPrice(priceFeed)` returns
// an 8-decimal price in the MARKET'S OWN QUOTE UNIT — USD for cUSDCv3/cUSDTv3,
// but ETH for cWETHv3 (its base feed is a constant 1e8; verified on-chain by
// scripts/verify-compound-v3-chain.mjs). The feed for the base token is
// `baseTokenPriceFeed()`; for a collateral asset it is
// `getAssetInfoByAddress(asset).priceFeed`.
//
// This resolver returns USD for EVERY market: the cWETHv3 market's ETH-quoted
// prices are converted with Comet's own WETH/USD feed (the cUSDCv3 market
// lists WETH as collateral) — both legs are the protocol's own oracle, so the
// product stays CHAIN-DERIVED and survives the chain-state gate, unlike a
// DefiLlama price. If the WETH/USD leg can't be read, the cWETHv3 prices are
// dropped entirely (callers degrade to token-only) rather than shipped in the
// wrong unit. This is the read that lets Compound's USD layer light up
// (lib/compound/economics.ts VALUED_USD).
//
// SERVER-ONLY — imported from /api/* route handlers only (it calls Alchemy via
// lib/sources/chain/rpc). Mirrors the batched-multicall shape of erc20-meta.ts.

import { parseAbi } from "viem";
import { chainClient } from "./rpc";
import { COMPOUND_DEPLOYMENT, type CometDeployment, type CometMarket } from "@/lib/compound/asset-catalog";
import { cometUsdOf } from "@/lib/compound/at-block-prices";

const COMET_ABI = parseAbi([
  "function baseTokenPriceFeed() view returns (address)",
  "function getAssetInfoByAddress(address asset) view returns ((uint8 offset, address asset, address priceFeed, uint64 scale, uint64 borrowCollateralFactor, uint64 liquidateCollateralFactor, uint64 liquidationFactor, uint128 supplyCap))",
  "function getPrice(address priceFeed) view returns (uint256)",
  "function numAssets() view returns (uint8)",
  "function getAssetInfo(uint8 i) view returns ((uint8 offset, address asset, address priceFeed, uint64 scale, uint64 borrowCollateralFactor, uint64 liquidateCollateralFactor, uint64 liquidationFactor, uint128 supplyCap))",
]);

/** Comet `getPrice` returns the market's quote unit with 8 decimals (PRICE_SCALE). */
const PRICE_SCALE = 1e8;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

// The ETH-quoted market and the USD reference for its conversion: Comet's own
// WETH/USD feed, read from the deployment's first USD-quoted market (cUSDCv3
// on both Ethereum and Base, and both list WETH as collateral). Resolved per
// deployment rather than pinned to Ethereum's roster since the Base explorer
// (2026-08-25) reads its own Comets through this same resolver.
function ethConversion(deployment: CometDeployment): { wethComet: string; usdComet: string; wethToken: string } | null {
  const eth = deployment.markets.find((m) => m.quoteUnit === "ETH");
  const usd = deployment.markets.find((m) => m.quoteUnit === "USD");
  if (!eth || !usd) return null;
  return {
    wethComet: eth.comet.toLowerCase(),
    usdComet: usd.comet.toLowerCase(),
    wethToken: eth.baseToken.toLowerCase(),
  };
}

export interface CometPriceRequest {
  /** The Comet proxy — every price cites its own market's oracle. */
  comet: string;
  baseToken: string;
  collateral: string[];
  /** Price every asset the Comet lists as well: a wallet's page, whose
   *  lifetime flows can name collateral it no longer holds. */
  wholeRoster?: boolean;
}

// Each Comet's collateral roster (numAssets / getAssetInfo), cached for an
// hour: governance adds an asset rarely, and a stale roster only leaves the
// new asset unpriced until the next read.
const ROSTER_TTL_MS = 60 * 60 * 1000;
const rosterCache = new Map<string, { at: number; assets: string[] }>();

/** The roster last read for a Comet (lowercased token addresses), if any. */
export function cometRosterOf(comet: string): string[] {
  return rosterCache.get(comet.toLowerCase())?.assets ?? [];
}

async function readRosters(client: ReturnType<typeof chainClient>, comets: string[]): Promise<void> {
  const stale = comets.filter((c) => {
    const hit = rosterCache.get(c);
    return !hit || Date.now() - hit.at > ROSTER_TTL_MS;
  });
  if (stale.length === 0) return;
  try {
    const counts = (await client.multicall({
      allowFailure: true,
      contracts: stale.map(
        (c) => ({ address: c as `0x${string}`, abi: COMET_ABI, functionName: "numAssets" }) as const,
      ),
    })) as { status: string; result?: unknown }[];
    const calls: { comet: string; i: number }[] = [];
    stale.forEach((c, k) => {
      const n = counts[k]?.status === "success" ? Number(counts[k].result) : 0;
      for (let i = 0; i < n; i++) calls.push({ comet: c, i });
    });
    const infos = (await client.multicall({
      allowFailure: true,
      contracts: calls.map(
        (x) =>
          ({ address: x.comet as `0x${string}`, abi: COMET_ABI, functionName: "getAssetInfo", args: [x.i] }) as const,
      ),
    })) as { status: string; result?: { asset?: string; priceFeed?: string } }[];
    const byComet = new Map<string, string[]>();
    calls.forEach((x, k) => {
      const r = infos[k];
      if (r?.status !== "success" || !r.result?.asset) return;
      const token = r.result.asset.toLowerCase();
      (byComet.get(x.comet) ?? byComet.set(x.comet, []).get(x.comet)!).push(token);
      const feed = r.result.priceFeed?.toLowerCase();
      if (feed && feed !== ZERO_ADDR) feedCache.set(priceKey(x.comet, token), feed);
    });
    stale.forEach((c, k) => {
      if (counts[k]?.status === "success") rosterCache.set(c, { at: Date.now(), assets: byComet.get(c) ?? [] });
    });
  } catch {
    // No roster: only the assets asked for are priced.
  }
}

/** Keyed by `${comet}:${token}` (both lowercased) → USD price per whole token.
 *  Keyed per-market because each Comet reads its own feeds. */
export type CometPriceMap = Map<string, number>;

const priceKey = (comet: string, token: string) => `${comet.toLowerCase()}:${token.toLowerCase()}`;

/** Look up a resolved price for one (market, token). */
export function cometPriceOf(map: CometPriceMap, comet: string, token: string): number | undefined {
  return map.get(priceKey(comet, token));
}

// Price feeds are immutable per (comet, token), so resolve each at most once and
// cache for the process lifetime. Prices themselves are read live every call.
const feedCache = new Map<string, string>(); // priceKey → feed address (lowercased)

interface Pair {
  comet: string;
  token: string;
  isBase: boolean;
}

/** Resolve on-chain oracle USD prices for every (market, token) across the page,
 *  batched into at most two multicalls (feed resolution, then getPrice). A missing
 *  RPC config or a failed read simply omits that token — callers must treat an
 *  absent price as "unpriced" and degrade (never assert a partial total). */
export async function resolveCometPrices(
  reqs: CometPriceRequest[],
  deployment: CometDeployment = COMPOUND_DEPLOYMENT,
): Promise<CometPriceMap> {
  const out: CometPriceMap = new Map();
  if (reqs.length === 0) return out;

  let client: ReturnType<typeof chainClient>;
  try {
    client = chainClient(deployment.chainId);
  } catch {
    return out; // The chain's RPC var is unset — no on-chain USD; callers stay token-only.
  }
  const conv = ethConversion(deployment);
  await readRosters(client, [...new Set(reqs.filter((r) => r.wholeRoster).map((r) => r.comet.toLowerCase()))]);

  // The distinct (market, token) pairs we need a price for, tagged base vs collateral.
  const pairs: Pair[] = [];
  const seen = new Set<string>();
  for (const r of reqs) {
    const comet = r.comet.toLowerCase();
    const add = (token: string, isBase: boolean) => {
      if (!token) return;
      const t = token.toLowerCase();
      const k = priceKey(comet, t);
      if (seen.has(k)) return;
      seen.add(k);
      pairs.push({ comet, token: t, isBase });
    };
    add(r.baseToken, true);
    for (const c of r.collateral) add(c, false);
    if (r.wholeRoster) for (const c of cometRosterOf(comet)) add(c, false);
  }

  // The cWETHv3 market quotes in ETH — its prices need Comet's own WETH/USD
  // feed (via the cUSDCv3 market) to convert. Make sure that leg is fetched.
  const needsEthUsd = conv != null && pairs.some((p) => p.comet === conv.wethComet);
  if (conv && needsEthUsd && !seen.has(priceKey(conv.usdComet, conv.wethToken))) {
    seen.add(priceKey(conv.usdComet, conv.wethToken));
    pairs.push({ comet: conv.usdComet, token: conv.wethToken, isBase: false });
  }

  // ── 1. Resolve price feeds for the uncached pairs ──
  const feedLookups = pairs.filter((p) => !feedCache.has(priceKey(p.comet, p.token)));
  if (feedLookups.length > 0) {
    let feedResults: unknown[] = [];
    try {
      feedResults = (await client.multicall({
        allowFailure: true,
        contracts: feedLookups.map((p) =>
          p.isBase
            ? ({ address: p.comet as `0x${string}`, abi: COMET_ABI, functionName: "baseTokenPriceFeed" } as const)
            : ({
                address: p.comet as `0x${string}`,
                abi: COMET_ABI,
                functionName: "getAssetInfoByAddress",
                args: [p.token as `0x${string}`],
              } as const),
        ),
      })) as unknown[];
    } catch {
      feedResults = [];
    }
    feedLookups.forEach((p, i) => {
      const res = feedResults[i] as { status: string; result?: unknown } | undefined;
      if (res?.status !== "success" || res.result == null) return;
      const feed = p.isBase ? (res.result as string) : (res.result as { priceFeed?: string }).priceFeed;
      if (typeof feed === "string" && feed.toLowerCase() !== ZERO_ADDR) {
        feedCache.set(priceKey(p.comet, p.token), feed.toLowerCase());
      }
    });
  }

  // ── 2. getPrice(feed) for every pair whose feed we know ──
  const priced = pairs
    .map((p) => ({ p, feed: feedCache.get(priceKey(p.comet, p.token)) }))
    .filter((x): x is { p: Pair; feed: string } => x.feed != null);
  if (priced.length === 0) return out;

  let priceResults: unknown[] = [];
  try {
    priceResults = (await client.multicall({
      allowFailure: true,
      contracts: priced.map(
        (x) =>
          ({
            address: x.p.comet as `0x${string}`,
            abi: COMET_ABI,
            functionName: "getPrice",
            args: [x.feed as `0x${string}`],
          }) as const,
      ),
    })) as unknown[];
  } catch {
    priceResults = [];
  }

  priced.forEach((x, i) => {
    const res = priceResults[i] as { status: string; result?: unknown } | undefined;
    if (res?.status !== "success" || res.result == null) return;
    const usd = Number(res.result as bigint) / PRICE_SCALE;
    if (usd > 0) out.set(priceKey(x.p.comet, x.p.token), usd);
  });

  // ── 3. Convert the ETH-quoted market to USD ──
  // cWETHv3 prices are in ETH; multiply through by Comet's own WETH/USD price.
  // Without that leg, drop the market's prices entirely — an unpriced token
  // degrades honestly, a wrong-unit "USD" would not.
  if (conv && needsEthUsd) {
    const ethUsd = out.get(priceKey(conv.usdComet, conv.wethToken));
    for (const [k, v] of [...out.entries()]) {
      if (!k.startsWith(`${conv.wethComet}:`)) continue;
      if (ethUsd != null && ethUsd > 0) out.set(k, v * ethUsd);
      else out.delete(k);
    }
  }

  return out;
}

// ── ETH/USD at a past block, for an ETH-quoted market's absorb ────────────────
// An absorb emits `usdValue` in its market's quote unit: in cWETHv3 (Ethereum
// and Base) the base feed is a constant 1e8, so that figure is WETH. To state it
// in dollars the page multiplies by Comet's own WETH/USD price AT THE ABSORB
// BLOCK: getPrice on the WETH feed a USD-quoted Comet of the same deployment
// lists (cUSDCv3 first; on Base, cUSDbCv3 answers for blocks before cUSDCv3
// existed). A past block's price never changes, so each answer is cached.

const ethUsdAtBlockCache = new Map<string, bigint>();

/** Comet's WETH/USD price (8 decimals) at each block, from the deployment's
 *  USD-quoted Comets. A block no USD Comet can price is absent from the map. */
export async function cometEthUsdAtBlocks(deployment: CometDeployment, blocks: number[]): Promise<Map<number, bigint>> {
  const out = new Map<number, bigint>();
  const eth = deployment.markets.find((m) => m.quoteUnit === "ETH");
  const usdMarkets = deployment.markets.filter((m) => m.quoteUnit === "USD");
  if (!eth || usdMarkets.length === 0) return out;
  const weth = eth.baseToken as `0x${string}`;
  const client = chainClient(deployment.chainId);
  await Promise.all(
    [...new Set(blocks)].map(async (block) => {
      const key = `${deployment.chainId}:${block}`;
      const hit = ethUsdAtBlockCache.get(key);
      if (hit != null) {
        out.set(block, hit);
        return;
      }
      for (const m of usdMarkets) {
        try {
          const comet = m.comet as `0x${string}`;
          const info = await client.readContract({
            address: comet,
            abi: COMET_ABI,
            functionName: "getAssetInfoByAddress",
            args: [weth],
            blockNumber: BigInt(block),
          });
          const price = await client.readContract({
            address: comet,
            abi: COMET_ABI,
            functionName: "getPrice",
            args: [info.priceFeed],
            blockNumber: BigInt(block),
          });
          if (price > BigInt(0)) {
            ethUsdAtBlockCache.set(key, price);
            out.set(block, price);
            return;
          }
        } catch {
          // This Comet did not exist or did not list WETH at that block: try the next.
        }
      }
    }),
  );
  return out;
}

// ── Every asset's price at a past block, for the Lifetime flows ──────────────
// The flows panel values each event at its block (lib/compound/flows.ts): the
// base's feed (baseTokenPriceFeed) and each asset's (getAssetInfoByAddress) as
// the Comet named them at that block, then getPrice on each, all at the block.
// An ETH-quoted Comet's prices are converted with WETH/USD at the same block,
// and dropped where that read fails.

/** USD per whole token at `block`, keyed by lowercased token address (the
 *  base under its own). An asset the Comet did not list then is absent. */
export async function cometPricesAtBlock(
  deployment: CometDeployment,
  market: CometMarket,
  assets: string[],
  block: number,
): Promise<Record<string, number>> {
  const client = chainClient(deployment.chainId);
  const comet = market.comet as `0x${string}`;
  const base = market.baseToken.toLowerCase();
  const coll = [...new Set(assets.map((a) => a.toLowerCase()))].filter((a) => a !== base);
  const at = BigInt(block);
  const feeds = (await client.multicall({
    allowFailure: true,
    blockNumber: at,
    contracts: [base, ...coll].map((t, i) =>
      i === 0
        ? ({ address: comet, abi: COMET_ABI, functionName: "baseTokenPriceFeed" } as const)
        : ({
            address: comet,
            abi: COMET_ABI,
            functionName: "getAssetInfoByAddress",
            args: [t as `0x${string}`],
          } as const),
    ),
  })) as { status: string; result?: unknown }[];
  const named: { token: string; feed: `0x${string}` }[] = [];
  feeds.forEach((r, i) => {
    if (r.status !== "success" || r.result == null) return;
    const feed = i === 0 ? (r.result as string) : (r.result as { priceFeed?: string }).priceFeed;
    if (typeof feed === "string" && feed.toLowerCase() !== ZERO_ADDR)
      named.push({ token: i === 0 ? base : coll[i - 1], feed: feed as `0x${string}` });
  });
  if (named.length === 0) return {};
  const res = (await client.multicall({
    allowFailure: true,
    blockNumber: at,
    contracts: named.map(
      (n) => ({ address: comet, abi: COMET_ABI, functionName: "getPrice", args: [n.feed] }) as const,
    ),
  })) as { status: string; result?: unknown }[];
  let quote: bigint | null = null;
  if (market.quoteUnit === "ETH") {
    const eth = (await cometEthUsdAtBlocks(deployment, [block])).get(block);
    if (eth == null || eth <= BigInt(0)) return {};
    quote = eth;
  }
  // The conversion the stored prices take too (lib/compound/at-block-prices.ts).
  const out: Record<string, number> = {};
  res.forEach((r, i) => {
    if (r.status !== "success" || r.result == null) return;
    const usd = cometUsdOf(r.result as bigint, quote);
    if (usd > 0) out[named[i].token] = usd;
  });
  return out;
}
