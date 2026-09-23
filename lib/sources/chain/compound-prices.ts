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
import { COMPOUND_DEPLOYMENT, type CometDeployment } from "@/lib/compound/asset-catalog";

const COMET_ABI = parseAbi([
  "function baseTokenPriceFeed() view returns (address)",
  "function getAssetInfoByAddress(address asset) view returns ((uint8 offset, address asset, address priceFeed, uint64 scale, uint64 borrowCollateralFactor, uint64 liquidateCollateralFactor, uint64 liquidationFactor, uint128 supplyCap))",
  "function getPrice(address priceFeed) view returns (uint256)",
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
