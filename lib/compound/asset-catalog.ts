// Compound V3 (Comet) market catalog (chain-state tier).
// ----------------------------------------------------------------------------
// Comet is single-base / multi-collateral: each market is ONE Comet proxy with a
// fixed BASE asset (the signed lend/borrow token) and N arbitrary COLLATERAL
// tokens. The three captured markets are keyed by a short slug (usdc/weth/usdt)
// that matches the backend `market` column (migs 052–054). The base symbol +
// decimals are FIXED per market, so they're hardcoded here (no ERC20 lookup);
// collateral symbols/decimals are resolved on demand from the chain via the
// generic resolver (lib/sources/chain/erc20-meta.ts). The Comet proxy address is
// the `contract` on every provenance entry for that market.
//
// Since Base (lib/compound-base/asset-catalog.ts) this file also carries the
// DEPLOYMENT layer: a Comet roster plus the chain it lives on. Comet exposes no
// enumerator — nothing answers "which markets are there" the way V2's
// Comptroller does — so a roster is always stated rather than read, on either
// chain. What is NOT stated is anything inside a market: its collateral roster,
// factors, caps, rates and prices are all the contract's own answers.

import { MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";

export interface CometMarket {
  /** Short slug, matches the backend `market` column. */
  key: string;
  /** Display label, e.g. "cUSDCv3". */
  label: string;
  /** The Comet proxy address (the position contract). */
  comet: string;
  /** The fixed base-asset symbol (signed lend/borrow token). */
  baseSymbol: string;
  /** The base-asset token address. */
  baseToken: string;
  /** The base asset's decimals. */
  baseDecimals: number;
  /** The unit this market's price feeds answer in. Comet prices everything —
   *  base and collateral alike — against ONE numeraire per market, and which
   *  one is a deployment fact rather than something derivable from the base
   *  symbol: it is whatever `baseTokenPriceFeed()` quotes in. Stated here per
   *  market and verified from the feed's own `description()` (Ethereum's and
   *  Base's alike; the ETH-quoted markets answer "Constant price feed", which
   *  is exactly what a base priced in itself looks like). Values in different
   *  units are never summed. */
  quoteUnit: "USD" | "ETH";
  /** The proxy's first block — the floor of a whole-life event sweep, and what
   *  lets a swept timeline claim completeness rather than a horizon. Stated
   *  only where a sweep reads it (the Base roster); the Ethereum markets are
   *  served from an index whose own floor is the backfill's. */
  deployBlock?: number;
}

export const COMPOUND_MARKETS: Record<string, CometMarket> = {
  usdc: {
    key: "usdc",
    label: "cUSDCv3",
    comet: "0xc3d688b66703497daa19211eedff47f25384cdc3",
    baseSymbol: "USDC",
    baseToken: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    baseDecimals: 6,
    quoteUnit: "USD",
  },
  weth: {
    key: "weth",
    label: "cWETHv3",
    comet: "0xa17581a9e3356d9a858b789d68b4d866e593ae94",
    baseSymbol: "WETH",
    baseToken: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    baseDecimals: 18,
    quoteUnit: "ETH",
  },
  usdt: {
    key: "usdt",
    label: "cUSDTv3",
    comet: "0x3afdc9bca9213a35503b077a6072f3d0d5ab0840",
    baseSymbol: "USDT",
    baseToken: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    baseDecimals: 6,
    quoteUnit: "USD",
  },
};

/** Resolve a market slug → its catalog entry, falling back to a synthetic entry
 *  for an unknown slug (so a newly-captured market never crashes the UI). */
export function marketOf(key: string): CometMarket {
  return (
    COMPOUND_MARKETS[key] ?? {
      key,
      label: `c${key.toUpperCase()}v3`,
      comet: "0x0000000000000000000000000000000000000000",
      baseSymbol: key.toUpperCase(),
      baseToken: "0x0000000000000000000000000000000000000000",
      baseDecimals: 18,
      // An unknown slug is a market this file has never seen, so its numeraire
      // is unknown too. USD is the roster's ordinary case and the safer guess
      // to render; the figures it labels are the backend's, not a chain read.
      quoteUnit: "USD",
    }
  );
}

/** Short, copy-friendly form of a wallet address. */
export const shortAddress = (addr: string): string => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

// ── the deployment layer ─────────────────────────────────────────────────────
// One Comet roster on one chain. The readers take this rather than reaching for
// a module-level catalog, which is the whole of what separates Ethereum's
// Compound V3 from Base's: same contract code, same arithmetic, different
// markets on a different chain.

export interface CometDeployment {
  /** The chain every Comet in `markets` lives on. */
  chainId: ChainId;
  /** The markets, in the order surfaces should show them. */
  markets: CometMarket[];
}

/** Compound V3 on Ethereum — the three Comets the backend indexes. */
export const COMPOUND_DEPLOYMENT: CometDeployment = {
  chainId: MAINNET_CHAIN_ID,
  markets: Object.values(COMPOUND_MARKETS),
};
