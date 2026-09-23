// SparkLend contract + asset catalog.
// ----------------------------------------------------------------------------
// SparkLend is an Aave V3 fork: a single mainnet Pool, reserves keyed by the
// underlying token ADDRESS. Symbols/decimals are resolved on demand from the
// chain via the generic ERC20 resolver (lib/sources/chain/erc20-meta.ts); the
// curated list below carries only what can't be read per-request — the
// governance-set liquidation thresholds and the canonical display symbols.

export const SPARK_ADDRESSES = {
  /** SparkLend Pool (proxy). */
  POOL: "0xc13e21b648a5ee794902342038ff3adab66be987",
  /** PoolAddressesProvider — the registry the Pool/oracle resolve from. */
  POOL_ADDRESSES_PROVIDER: "0x02c3ea4e34c0cbd694d2adfa2c690eecbc1793ee",
  /** SparkLend IAaveOracle — the same oracle the Pool reads to price collateral
   *  and compute health factors. `getAssetPrice(asset)` returns USD with 8
   *  decimals, so the USD it yields is chain-derived (survives the on-chain-only
   *  gate). SparkLend is an Aave V3 fork with its own oracle deployment. */
  ORACLE: "0x8105f69d9c41644c6a0803fda7d03aa70996cfd9",
  /** SparkLend CapAutomator — raises each reserve's live supply and borrow cap
   *  toward a governance-set maximum (`supplyCapConfigs` / `borrowCapConfigs`).
   *  Source: sparkdotfi/spark-address-registry src/SparkLend.sol,
   *  `CAP_AUTOMATOR`; its `pool()` answers the Pool above (read 2026-09-22). */
  CAP_AUTOMATOR: "0x4c1341636721b8b687647920b2e9481f3ab1f2ee",
} as const;

// ── Reserve catalog ──────────────────────────────────────────────────────────
// The full SparkLend reserve set (Pool.getReservesList — 18 reserves), with each
// reserve's governance-set liquidation threshold as read from
// Pool.getConfiguration on 2026-07-12 via scripts/verify-spark-fork-deltas.mjs.
// LTs are governance constants (they move rarely); re-run that script to
// re-verify the table whenever Spark risk params change.
//
// lt = null marks a reserve whose on-chain LT is 0 — borrow-only on SparkLend
// (the stablecoins USDC/USDT/USDS/PYUSD). DAI is the deliberate oddity: its LT
// is 1 bps (0.0001), the epsilon Spark governance used to retire raw-DAI
// collateral without a hard cutover — recorded exactly, never rounded to 0.

export interface SparkCatalogAsset {
  symbol: string;
  /** Lowercased underlying token address. */
  address: string;
  /** Liquidation threshold as a 0..1 fraction; null = borrow-only (LT 0). */
  lt: number | null;
  /** Frozen on-chain (no new supplies/borrows; existing positions unwind). */
  frozen?: boolean;
}

export const SPARK_CATALOG: SparkCatalogAsset[] = [
  { symbol: "DAI", address: "0x6b175474e89094c44da98b954eedeac495271d0f", lt: 0.0001 },
  { symbol: "sDAI", address: "0x83f20f44975d03b1b09e64809b757c47f942beea", lt: 0.8 },
  { symbol: "USDC", address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", lt: null },
  { symbol: "WETH", address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", lt: 0.86 },
  { symbol: "wstETH", address: "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0", lt: 0.84 },
  { symbol: "WBTC", address: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", lt: 0.78 },
  { symbol: "GNO", address: "0x6810e776880c02933d47db1b9fc05908e5386b96", lt: 0.25, frozen: true },
  { symbol: "rETH", address: "0xae78736cd615f374d3085123a210448e74fc6393", lt: 0.7, frozen: true },
  { symbol: "USDT", address: "0xdac17f958d2ee523a2206206994597c13d831ec7", lt: null },
  { symbol: "weETH", address: "0xcd5fe23c85820f7b72d0926fc9b05b43e359b7ee", lt: 0.8 },
  { symbol: "cbBTC", address: "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf", lt: 0.82 },
  { symbol: "sUSDS", address: "0xa3931d71877c0e7a3148cb7eb4463524fec27fbd", lt: 0.8 },
  { symbol: "USDS", address: "0xdc035d45d973e3ec169d2276ddab16f1e407384f", lt: null },
  { symbol: "LBTC", address: "0x8236a87084f8b84306f72007f36f2618a5634494", lt: 0.75 },
  { symbol: "tBTC", address: "0x18084fba666a33d37592fa2633fd49a74dd93a88", lt: 0.7, frozen: true },
  { symbol: "ezETH", address: "0xbf5495efe5db9ce00f80364c8b423567e58d2110", lt: 0.7, frozen: true },
  { symbol: "rsETH", address: "0xa1290d69c65a6fe4df752f95823fae25cb99e5a7", lt: 0.7, frozen: true },
  { symbol: "PYUSD", address: "0x6c3ea9036406852006290770bedfcaba0e23a0e8", lt: null },
];

/** Lowercased address → canonical display symbol. */
export const SPARK_SYMBOL_BY_ADDR: Record<string, string> = Object.fromEntries(
  SPARK_CATALOG.map((a) => [a.address, a.symbol]),
);

/** Lowercased address → liquidation threshold (0..1), or null when borrow-only. */
export const SPARK_LT_BY_ADDR: Record<string, number | null> = Object.fromEntries(
  SPARK_CATALOG.map((a) => [a.address, a.lt]),
);

/** Symbol → lowercased address (filter chips, dominant-asset links). */
export const SPARK_ADDR_BY_SYMBOL: Record<string, string> = Object.fromEntries(
  SPARK_CATALOG.map((a) => [a.symbol, a.address]),
);
