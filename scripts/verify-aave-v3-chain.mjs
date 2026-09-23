// Verify the Aave V3 (Core, mainnet) chain facts the explorer renders as primary
// truth — the address graph, risk constants, oracle prices, reserve state, rates
// and a real position are all re-derived directly from the chain (a second data
// path) and checked, so no unverified assumption is encoded. The six checks this
// script runs — and the architecture they map onto, and the seventh the Base
// lanes add — live in scripts/lib/aave-v3-fork-verify-core.mjs;
// SparkLend (an Aave V3 fork) runs the SAME core through verify-spark-chain.mjs
// with its own addresses. This script pins ONLY Aave V3's own addresses and
// catalog and exits on its OWN failure count — a red Spark cannot hide here.
//
// The Pool + IAaveOracle + CATALOG below mirror lib/aave-v3/asset-catalog.ts (the
// explorer's stated constants); node can't import that .ts without a loader, so
// they're inlined here the way verify-liquity-chain.mjs inlines its catalog. The
// PoolAddressesProvider is NOT pinned — check #1 derives it from the Pool and
// cross-checks it both directions (the oracle and data-provider point back to it).
//
// Interest-rate strategy shape: Aave V3 mainnet runs ONE shared
// DefaultReserveInterestRateStrategyV2 across all reserves, read with asset-arg
// getters (getBaseVariableBorrowRate(asset), …) — strategyMode "asset".
//
// DECLARED OMISSIONS / findings:
//   • Catalog LT cross-check is GATED (catalogAuthoritative: true), matching
//     Spark's posture. lib/aave-v3/asset-catalog.ts was re-verified against chain
//     on 2026-07-21 (21 of 29 LTs had drifted since the catalog was last set,
//     including crvUSD/RPL/RLUSD, whose chain LT is currently 0 — collateral
//     disabled — so they now carry lt: 0 rather than a stale non-zero fallback
//     value). Check #2 asserts both the chain config's internal consistency (the
//     rendered constant — the detail reader renders the LIVE getConfiguration LT
//     and falls back to the catalog only when chain LT is 0) and hard equality
//     between the catalog and chain for every catalog asset.
//   • Liquidation-bonus and per-reserve accrued-interest exactness are not
//     asserted; check #4 asserts only the exact reserve identities (indexes ≥ 1
//     RAY, available liquidity ≥ 0) and reports the virtual-accounting reconciliation.
//
// Run: node scripts/verify-aave-v3-chain.mjs
// Env: .env.local — ALCHEMY_URL (chain); RAILS_API_URL + API_BEARER_TOKEN (the
//      position sample; check #6 skips gracefully without them).

import { mainnet } from "viem/chains";
import { loadEnv, run } from "./lib/aave-v3-fork-verify-core.mjs";

// Aave V3 Core Pool + the shared IAaveOracle (lib/aave-v3/asset-catalog.ts).
const AAVE_V3_POOL = "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2";
const AAVE_V3_ORACLE = "0x54586be62e3c3580375ae3723c145253060ca0c2";

// Mirrors AAVE_V3_CATALOG in lib/aave-v3/asset-catalog.ts — the explorer's stated
// per-reserve liquidation thresholds. Check #2 audits these against chain.
const AAVE_V3_CATALOG = [
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

const env = loadEnv(import.meta.url, "ALCHEMY_URL");

const failures = await run({
  label: "Aave V3 (Core)",
  chain: mainnet,
  rpcKey: "ALCHEMY_URL",
  pool: AAVE_V3_POOL,
  oracle: AAVE_V3_ORACLE,
  catalog: AAVE_V3_CATALOG,
  catalogAuthoritative: true,
  strategyMode: "asset",
  apiSlug: "aave-v3",
  env,
});

process.exit(failures === 0 ? 0 : 1);
