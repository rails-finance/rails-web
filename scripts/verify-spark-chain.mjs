// Verify the SparkLend (mainnet) chain facts the explorer renders as primary
// truth. SparkLend is an Aave V3 fork — one cross-collateralised Pool, reserves
// keyed by underlying address, priced through one IAaveOracle, configured via a
// PoolAddressesProvider — so it runs the SAME shared core as Aave V3
// (scripts/lib/aave-v3-fork-verify-core.mjs), with SparkLend's own pinned
// addresses and catalog. This is NOT scripts/verify-spark-fork-deltas.mjs (that
// one only sanity-checks contract SHAPE against Aave V3); this re-derives Spark's
// figures from a second chain path and checks them. It exits on its OWN failure
// count — a red Spark is never masked by a green Aave V3.
//
// The Pool / PoolAddressesProvider / IAaveOracle + CATALOG below mirror
// lib/spark/asset-catalog.ts (the explorer's stated constants); inlined here the
// way verify-liquity-chain.mjs inlines its catalog (node can't import the .ts).
// Unlike Aave V3, Spark PINS its provider — check #1 asserts the Pool derives the
// same one, and the oracle / data-provider point back to it.
//
// Interest-rate strategy shape: SparkLend runs PER-RESERVE legacy
// DefaultReserveInterestRateStrategy contracts (13 distinct across 18 reserves),
// read with no-arg getters (getBaseVariableBorrowRate(), …) — strategyMode "noarg".
//
// The Spark catalog is AUTHORITATIVE (catalogAuthoritative: true): it was
// re-verified against getConfiguration on 2026-07-12 (see the asset-catalog.ts
// header) and matches chain to the basis point, so check #2 asserts catalog LT ==
// chain LT for every reserve as a hard equality — DAI's 1-bps epsilon LT included.
//
// DECLARED OMISSIONS: same as the Aave V3 script — liquidation-bonus and accrued
// interest exactness are not asserted; check #4 asserts the exact reserve
// identities and reports the virtual-accounting reconciliation.
//
// Run: node scripts/verify-spark-chain.mjs
// Env: .env.local — ALCHEMY_URL (chain); RAILS_API_URL + API_BEARER_TOKEN (the
//      position sample; check #6 skips gracefully without them).

import { mainnet } from "viem/chains";
import { loadEnv, run } from "./lib/aave-v3-fork-verify-core.mjs";

// SparkLend Pool + pinned PoolAddressesProvider + IAaveOracle (lib/spark/asset-catalog.ts).
const SPARK_POOL = "0xc13e21b648a5ee794902342038ff3adab66be987";
const SPARK_PROVIDER = "0x02c3ea4e34c0cbd694d2adfa2c690eecbc1793ee";
const SPARK_ORACLE = "0x8105f69d9c41644c6a0803fda7d03aa70996cfd9";

// Mirrors SPARK_CATALOG in lib/spark/asset-catalog.ts — the explorer's stated
// per-reserve liquidation thresholds (LT 0 → borrow-only, carried as null).
const SPARK_CATALOG = [
  { symbol: "DAI", address: "0x6b175474e89094c44da98b954eedeac495271d0f", lt: 0.0001 },
  { symbol: "sDAI", address: "0x83f20f44975d03b1b09e64809b757c47f942beea", lt: 0.8 },
  { symbol: "USDC", address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", lt: null },
  { symbol: "WETH", address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", lt: 0.86 },
  { symbol: "wstETH", address: "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0", lt: 0.84 },
  { symbol: "WBTC", address: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", lt: 0.78 },
  { symbol: "GNO", address: "0x6810e776880c02933d47db1b9fc05908e5386b96", lt: 0.25 },
  { symbol: "rETH", address: "0xae78736cd615f374d3085123a210448e74fc6393", lt: 0.7 },
  { symbol: "USDT", address: "0xdac17f958d2ee523a2206206994597c13d831ec7", lt: null },
  { symbol: "weETH", address: "0xcd5fe23c85820f7b72d0926fc9b05b43e359b7ee", lt: 0.8 },
  { symbol: "cbBTC", address: "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf", lt: 0.82 },
  { symbol: "sUSDS", address: "0xa3931d71877c0e7a3148cb7eb4463524fec27fbd", lt: 0.8 },
  { symbol: "USDS", address: "0xdc035d45d973e3ec169d2276ddab16f1e407384f", lt: null },
  { symbol: "LBTC", address: "0x8236a87084f8b84306f72007f36f2618a5634494", lt: 0.75 },
  { symbol: "tBTC", address: "0x18084fba666a33d37592fa2633fd49a74dd93a88", lt: 0.7 },
  { symbol: "ezETH", address: "0xbf5495efe5db9ce00f80364c8b423567e58d2110", lt: 0.7 },
  { symbol: "rsETH", address: "0xa1290d69c65a6fe4df752f95823fae25cb99e5a7", lt: 0.7 },
  { symbol: "PYUSD", address: "0x6c3ea9036406852006290770bedfcaba0e23a0e8", lt: null },
];

const env = loadEnv(import.meta.url, "ALCHEMY_URL");

const failures = await run({
  label: "SparkLend",
  chain: mainnet,
  rpcKey: "ALCHEMY_URL",
  pool: SPARK_POOL,
  provider: SPARK_PROVIDER,
  oracle: SPARK_ORACLE,
  catalog: SPARK_CATALOG,
  catalogAuthoritative: true,
  strategyMode: "noarg",
  apiSlug: "spark",
  env,
});

process.exit(failures === 0 ? 0 : 1);
