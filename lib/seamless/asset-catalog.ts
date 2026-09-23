// Seamless on Base — the market's identity, and the fact that it is closed.
// ----------------------------------------------------------------------------
// Seamless is an Aave V3 fork, verified by interface rather than by reputation:
// its Pool answers `getReservesList()`, `getUserAccountData()`, `getReserveData()`
// and `getUserConfiguration()` with the identical Aave V3 structs, which is what
// lets the shared readers (lib/sources/chain/aave-v3-position.ts and
// aave-market-overview.ts) serve it unchanged.
//
// As with the Aave V3 Base catalog, nothing is hand-maintained here that the
// Pool itself states: LTV, liquidation threshold and the frozen bit all decode
// from each reserve's own `configuration` word, symbols and decimals come from
// the reserves' own ERC20s, and USD comes from the oracle the Pool liquidates
// with. Only the identities are written down, and they were resolved from the
// protocol's own registry: `Pool.ADDRESSES_PROVIDER()` →
// `0x0E02EB705be325407707662C6f6d3466E939f3a0`, whose `getMarketId()` returns
// "Base Seamless Market", whose `getPool()` returns the Pool below (checked
// equal) and whose `getPriceOracle()` returns the oracle below. Its oracle's
// `BASE_CURRENCY` is the zero address at `BASE_CURRENCY_UNIT` 1e8, so the USD it
// reports is 8-decimal USD like Aave's own. Verified 2026-08-23.
//
// THE ONE THING THIS MARKET NEEDS SAID: it is closed to new business. Every one
// of its eighteen reserves carries the frozen bit, and all eighteen were frozen
// in ONE TRANSACTION — 0x1613ee0c…eace4 at block 28,952,883, 2025-04-15, which
// emitted exactly eighteen `ReserveFrozen` events from the PoolConfigurator and
// no `ReserveUnfrozen` since. One governance action closing a market, rather
// than a market fading asset by asset. A frozen reserve still accrues
// interest, still liquidates and still lets a holder repay and withdraw; what it
// does not allow is a new supply or a new borrow. So every rate and every risk
// parameter this explorer shows is live and enforced, and none of it is an
// invitation: nobody can take a new position here.

import { BASE_CHAIN_ID } from "@/lib/shared/chains";

/** The Seamless Pool on Base — one pool, every reserve, one health factor per
 *  wallet, the same interface Aave V3's Pool answers. */
export const SEAMLESS_POOL = "0x8f44fd754285aa6a2b8b9b97739b79746e0475a7" as const;

/** The IAaveOracle this Pool prices collateral and debt with — the market's own,
 *  not Aave's. USD at 8 decimals. */
export const SEAMLESS_ORACLE = "0xfdd4e83890bccd1fbf9b10d71a5cc0a738753b01" as const;

/** The chain every address here lives on. */
export const SEAMLESS_CHAIN_ID = BASE_CHAIN_ID;

/** The block every reserve was frozen in — one action, all eighteen. Found by
 *  binary search over the frozen bit of each reserve's configuration word using
 *  archive `eth_call` (frozen at 28,952,883, not frozen at 28,952,882), then
 *  confirmed against the PoolConfigurator's own `ReserveFrozen` log. */
export const SEAMLESS_FREEZE_BLOCK = 28_952_883;

/** The transaction that did it. Eighteen `ReserveFrozen` events, one tx, one
 *  block — which is why the surfaces can link the reader at the act itself
 *  rather than at the block it happened to land in. */
export const SEAMLESS_FREEZE_TX = "0x1613ee0c6e9a1a2e551c881e3a63652d1ad820a12f5e4f1a3daec48abafeace4" as const;

/** The date of that block, for surfaces that say it in words. */
export const SEAMLESS_FREEZE_DATE = "15 April 2025";

/** The Pool's first block — the floor of a whole-life event sweep.
 *
 *  Together with the freeze block above this market has something no other
 *  explorer on the roster does: BOTH ends of its life are known constants. The
 *  sweep still runs to the head rather than stopping at the freeze, because a
 *  frozen reserve keeps emitting — repayments, withdrawals and liquidations all
 *  still happen on it; only new supplies and borrows cannot. */
export const SEAMLESS_DEPLOY_BLOCK = 3_318_602;

// More facts, deliberately unexported until something reads them — the
// dead-export gate is right that an unused constant reads as live wiring:
//
//   PoolAddressesProvider  0x0E02EB705be325407707662C6f6d3466E939f3a0
//     — the registry the two addresses above were resolved from, written down
//       so the next reader can re-derive them rather than trust this file. Its
//       `owner()` is the zero address: ownership renounced, so the Pool, oracle
//       and configurator this market points at can no longer be swapped.
//   PoolConfigurator       0x7B08A77539A50218c8fB4B706B87fb799d3505A0
//   ACLManager             0x003c2aa63FEC8118297535350a66e7A53BE3d0B5
