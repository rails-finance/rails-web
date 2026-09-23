// Verify the Aave V3 on BASE (chain 8453) facts the explorer renders as primary
// truth — the address graph, risk constants, oracle prices, reserve state, rates,
// a real position and the timeline replay, all re-derived from the chain and
// checked. Same shared core as the Ethereum Pool and SparkLend
// (scripts/lib/aave-v3-fork-verify-core.mjs); the deployment is the parameter.
//
// The Pool, oracle and PoolAddressesProvider below mirror
// lib/aave-v3-base/asset-catalog.ts (node can't import that .ts through the "@/"
// alias, so they are inlined the way every sibling verifier inlines its
// constants). The provider IS pinned here, as Spark's is: the catalog names it
// as the registry the other two were resolved from, so check #1 asserts the Pool
// derives that same one and that the oracle and data-provider point back to it.
//
// WHAT IT DOES NOT CHECK, and why:
//   • Catalog liquidation thresholds. There is no table to check — this
//     explorer publishes none, by design: every risk parameter it renders is
//     decoded from the reserve's own `configuration` word, which is the word the
//     Pool liquidates with. So check #2 asserts that word's internal consistency
//     and its decimals against each token's ERC20, and states the absence of a
//     second source rather than inventing one (`catalog: null`).
//   • Anything needing a log range. BASE_RPC_URL is a full archive for eth_call
//     and eth_getCode, and its eth_getLogs answers TEN BLOCKS at a time. That is
//     an absence, not a budget preference: no whole-life log sweep can run on
//     this endpoint. BASE_HYPERRPC_URL is not the way round it — it has returned
//     partial log sets, which is worse than no answer.
//   • The listing's own figures. A Base listing row is already a chain read at a
//     pinned block, so re-reading the chain would agree with it by construction.
//     Check #7 checks the thing that CAN disagree — the timeline's replay —
//     against the aToken's and debt token's own balanceOf.
//   • Liquidation-bonus and accrued-interest exactness (as on every sibling);
//     check #4 asserts the exact reserve identities and reports the
//     virtual-accounting reconciliation.
//
// Run: node scripts/verify-aave-v3-base-chain.mjs
//      BASE=https://preview.rails.finance node scripts/verify-aave-v3-base-chain.mjs
// Env: .env.local — BASE_RPC_URL (chain); RAILS_API_URL + API_BEARER_TOKEN (the
//      position sample; checks #6 and #7 skip gracefully without them).
//      BASE (process env) — the web origin check #7 reads the timeline from;
//      defaults to a local dev server.

import { base } from "viem/chains";
import { loadEnv, run } from "./lib/aave-v3-fork-verify-core.mjs";

// lib/aave-v3-base/asset-catalog.ts — the market's whole stated identity.
const AAVE_V3_BASE_POOL = "0xa238dd80c259a72e81d7e4664a9801593f98d1c5";
const AAVE_V3_BASE_ORACLE = "0x2cc0fc26ed4563a5ce5e8bdcfe1a2878676ae156";
const AAVE_V3_BASE_PROVIDER = "0xe20fcbdbffc4dd138ce8b2e6fbb6cb49777ad64d";

const env = loadEnv(import.meta.url, "BASE_RPC_URL");

const failures = await run({
  label: "Aave V3 (Base)",
  chain: base,
  rpcKey: "BASE_RPC_URL",
  pool: AAVE_V3_BASE_POOL,
  provider: AAVE_V3_BASE_PROVIDER,
  oracle: AAVE_V3_BASE_ORACLE,
  // No curated liquidation-threshold table — see the header.
  catalog: null,
  catalogAuthoritative: false,
  // One shared DefaultReserveInterestRateStrategyV2 across every reserve, read
  // with asset-arg getters.
  strategyMode: "asset",
  apiSlug: "aave-v3-base",
  // The Base lending route sorts on "debt"/"coll", not the Ethereum lane's
  // "debtUsd"; an unrecognised key would leave the sample to the route's default.
  positionsSort: "debt",
  timeline: { origin: process.env.BASE ?? "http://localhost:3000", slug: "aave-v3-base" },
  env,
});

process.exit(failures === 0 ? 0 : 1);
