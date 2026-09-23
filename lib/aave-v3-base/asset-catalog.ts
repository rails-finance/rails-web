// Aave V3 on Base — the market's identity, and deliberately nothing else.
// ----------------------------------------------------------------------------
// The Ethereum sibling (lib/aave-v3/asset-catalog.ts) hand-maintains ~29
// governance liquidation thresholds and a symbol override table. This file has
// neither, on purpose: everything that catalog supplies is readable from the
// Base Pool itself.
//
//   • LTV, liquidation threshold and liquidation bonus decode from each
//     reserve's own `configuration` word — the same word the Pool enforces
//     with, so it cannot be stale the way a copied governance table can.
//   • Symbols and decimals come from the reserves' own ERC20s.
//   • USD comes from the oracle the Pool liquidates with.
//
// So the only thing worth writing down is which contracts are the market, and
// even those were taken from the protocol's own registry rather than a docs
// page: `Pool.ADDRESSES_PROVIDER()` →
// `0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D`, whose `getPool()` returns the
// Pool below (checked equal) and whose `getPriceOracle()` returns the oracle
// below. Verified 2026-08-23.

import { BASE_CHAIN_ID } from "@/lib/shared/chains";

/** The Aave V3 Pool on Base — one pool, every reserve, one health factor per
 *  wallet. Same interface as Ethereum's Core Pool, which is what lets the
 *  shared readers serve both. */
export const AAVE_V3_BASE_POOL = "0xa238dd80c259a72e81d7e4664a9801593f98d1c5" as const;

/** The IAaveOracle this Pool prices collateral and debt with. Its base currency
 *  is USD at 8 decimals (`BASE_CURRENCY` = the zero address, `BASE_CURRENCY_UNIT`
 *  = 1e8), so the USD totals the Pool reports are the protocol's own. */
export const AAVE_V3_BASE_ORACLE = "0x2cc0fc26ed4563a5ce5e8bdcfe1a2878676ae156" as const;

/** The chain every address here lives on. */
export const AAVE_V3_BASE_CHAIN_ID = BASE_CHAIN_ID;

/** The Pool's first block. The floor of any whole-life event sweep, and the
 *  reason the Base timeline can claim COMPLETENESS rather than a horizon: the
 *  sweep starts here, so there is no earlier Pool activity for it to have
 *  missed. Resolved from the Pool's deployment transaction. */
export const AAVE_V3_BASE_DEPLOY_BLOCK = 2_357_134;

// One more fact, deliberately not exported until something reads it — the
// dead-export gate is right that an unused constant reads as live wiring when
// it isn't:
//
//   PoolAddressesProvider  0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D
//     — the registry the two addresses above were resolved from, written down
//       so the next reader can re-derive them rather than trust this file.
