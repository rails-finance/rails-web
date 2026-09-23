// Aave V3 Core (mainnet) asset catalog — the per-reserve liquidation thresholds
// and canonical display symbols the V3 surfaces key off.
// ----------------------------------------------------------------------------
// Governance-set LTs (from https://app.aave.com/markets/ — Aave V3 Core,
// Ethereum). V3 is a single `Pool`, reserves keyed by their underlying TOKEN
// ADDRESS (no V4-style spokes / reserve ids), so this map is address-keyed.
//
// Scope of this table vs. the dump: the frozen dump's `mv_aave_v3_events` carries
// ~67 distinct reserve addresses (the full listed set + delisted long-tail). This
// catalog curates the ~25 with known, stable governance LTs — the assets that
// drive the HF math and the listing's dominant-asset icons. Reserves NOT here
// resolve their symbol + decimals from chain (an ERC20 multicall, like the V4
// adapter's getReserve), and carry a null LT (excluded from the risk-adjusted
// collateral sum — the honest "we don't have its LT" path, never a guessed one).
//
// LTs are governance constants (change ≲3×/year); refresh when V3 risk params
// move. Decimals are deliberately NOT hardcoded here — they're read from chain so
// they're never wrong for a long-tail reserve.

export interface AaveV3CatalogAsset {
  symbol: string;
  /** Lowercased underlying token address. */
  address: string;
  /** Liquidation threshold as a 0..1 fraction; null = borrow-only / no LT. */
  lt: number | null;
}

// Curated reserves with known LTs. Borrow-only assets (GHO) carry lt = null —
// they can't be collateral, so they never contribute risk-adjusted value.
export const AAVE_V3_CATALOG: AaveV3CatalogAsset[] = [
  { symbol: "WETH", address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", lt: 0.83 },
  { symbol: "wstETH", address: "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0", lt: 0.81 },
  { symbol: "weETH", address: "0xcd5fe23c85820f7b72d0926fc9b05b43e359b7ee", lt: 0.8 },
  { symbol: "rETH", address: "0xae78736cd615f374d3085123a210448e74fc6393", lt: 0.79 },
  { symbol: "cbETH", address: "0xbe9895146f7af43049ca1c1ae358b0541ea49704", lt: 0.79 },
  { symbol: "WBTC", address: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", lt: 0.78 },
  { symbol: "cbBTC", address: "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf", lt: 0.78 },
  { symbol: "LBTC", address: "0x8236a87084f8b84306f72007f36f2618a5634494", lt: 0.75 },
  { symbol: "USDC", address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", lt: 0.78 },
  { symbol: "USDT", address: "0xdac17f958d2ee523a2206206994597c13d831ec7", lt: 0.78 },
  { symbol: "DAI", address: "0x6b175474e89094c44da98b954eedeac495271d0f", lt: 0.77 },
  { symbol: "sDAI", address: "0x83f20f44975d03b1b09e64809b757c47f942beea", lt: 0.78 },
  { symbol: "USDe", address: "0x4c9edd5852cd905f086c759e8383e09bff1e68b3", lt: 0.75 },
  { symbol: "sUSDe", address: "0x9d39a5de30e57443bff2a8307a4256c8797a3497", lt: 0.75 },
  { symbol: "PYUSD", address: "0x6c3ea9036406852006290770bedfcaba0e23a0e8", lt: 0.78 },
  { symbol: "crvUSD", address: "0xf939e0a03fb07f59a73314e73794be0e57ac1b4e", lt: 0 },
  { symbol: "FRAX", address: "0x853d955acef822db058eb8505911ed77f175b99e", lt: 0.72 },
  { symbol: "LUSD", address: "0x5f98805a4e8be255a32880fdec7f6728c6568ba0", lt: 0.77 },
  { symbol: "GHO", address: "0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f", lt: null },
  { symbol: "AAVE", address: "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9", lt: 0.76 },
  { symbol: "LINK", address: "0x514910771af9ca656af840dff83e8264ecf986ca", lt: 0.71 },
  { symbol: "CRV", address: "0xd533a949740bb3306d119cc777fa900ba034cd52", lt: 0.41 },
  { symbol: "RPL", address: "0xd33526068d116ce69f19a9ee46f0bd304f21a51f", lt: 0 },
  { symbol: "ETHx", address: "0xa35b1b31ce002fbf2058d22f30f95d405200a15b", lt: 0.77 },
  { symbol: "osETH", address: "0xf1c9acdc66974dfb6decb12aa385b9cd01190e38", lt: 0.75 },
  { symbol: "tBTC", address: "0x18084fba666a33d37592fa2633fd49a74dd93a88", lt: 0.78 },
  { symbol: "USDS", address: "0xdc035d45d973e3ec169d2276ddab16f1e407384f", lt: 0.78 },
  { symbol: "RLUSD", address: "0x8292bb45bf1ee4d140127049757c2e0ff06317ed", lt: 0 },
  { symbol: "EURC", address: "0x1abaea1f7c830bd89acc67ec4af516284b1bc33c", lt: 0.78 },
];

/** Lowercased address → canonical display symbol (overrides the on-chain ERC20
 *  symbol for the assets we name explicitly). */
export const V3_SYMBOL_BY_ADDR: Record<string, string> = Object.fromEntries(
  AAVE_V3_CATALOG.map((a) => [a.address.toLowerCase(), a.symbol]),
);

/** Lowercased address → liquidation threshold (0..1), or null when unknown /
 *  borrow-only. Drives the risk-adjusted collateral sum in the HF derivation. */
export const V3_LT_BY_ADDR: Record<string, number | null> = Object.fromEntries(
  AAVE_V3_CATALOG.map((a) => [a.address.toLowerCase(), a.lt]),
);

/** Aave V3 Core Pool. Kept as a named export for the many call sites that
 *  predate multi-market; equal to POOL_BY_MARKET.core. */
export const AAVE_V3_POOL = "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2" as const;

/** Aave V3 IAaveOracle (mainnet) — the same oracle the Pool reads to price
 *  collateral and compute health factors. `getAssetPrice(asset)` returns USD with
 *  8 decimals, so the USD it yields is chain-derived (survives the on-chain-only
 *  gate). Shared across all three V3 markets (they price through one oracle). */
export const AAVE_V3_ORACLE = "0x54586be62e3c3580375ae3723c145253060ca0c2" as const;

// ── Markets (Slice 3) ────────────────────────────────────────────────────────
// Aave V3 spans three mainnet markets, each a SEPARATE Pool contract and a
// distinct cross-collateralised account per wallet. Token metadata above stays
// address-keyed (a token's symbol/decimals/LT are the same wherever it lists);
// only the POOL address is market-scoped. Mirrors the rails-server MARKETS map +
// migration 039's market CASE.
export type AaveV3MarketKey = "core" | "prime" | "etherfi";
export interface AaveV3Market {
  key: AaveV3MarketKey;
  /** Human label for the market selector / badges. */
  name: string;
  /** Lowercased Pool contract address. */
  pool: string;
}
export const AAVE_V3_MARKETS: readonly AaveV3Market[] = [
  { key: "core", name: "Core", pool: "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2" },
  { key: "prime", name: "Prime", pool: "0x4e033931ad43597d96d6bcc25c280717730b58b1" },
  { key: "etherfi", name: "EtherFi", pool: "0x0aa97c284e98396202b6a04024f5e2c65026f3c0" },
];
export const POOL_BY_MARKET: Record<string, string> = Object.fromEntries(AAVE_V3_MARKETS.map((m) => [m.key, m.pool]));
export const MARKET_NAME: Record<string, string> = Object.fromEntries(AAVE_V3_MARKETS.map((m) => [m.key, m.name]));
/** Default market for back-compat: rows/links without an explicit market are Core. */
export const DEFAULT_V3_MARKET: AaveV3MarketKey = "core";
/** Validate an arbitrary string as a known market key (else fall back to core). */
export function asV3Market(v: string | null | undefined): AaveV3MarketKey {
  return v === "prime" || v === "etherfi" || v === "core" ? v : DEFAULT_V3_MARKET;
}
