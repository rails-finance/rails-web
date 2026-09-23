/**
 * LlamaLend (Curve, Ethereum mainnet) — addresses, scales and the
 * isolated-market vocabulary.
 *
 * ⚠️ There is deliberately NO market roster in this file. LlamaLend markets are
 * born from factories (a NewVault / AddMarket away), so the roster is read from
 * the factories' own counters at head — `market_count()` / `n_collaterals()` —
 * never hardcoded. Three factories, all live, each pinned here BY BYTECODE
 * (the prototype archive's manifest factory address had never existed on
 * chain; every address below was re-verified against deployed code):
 *
 *   • OneWayLendingFactory (V1 lend markets — lenders fund a vault, borrowers
 *     draw the borrowed token against one collateral).
 *   • crvUSD ControllerFactory (V1 mint markets — crvUSD minted against one
 *     collateral, under a per-market debt ceiling).
 *   • LlamaLend V2 Factory (the next generation — `controllers(i)` REVERTS on
 *     it; discovery goes through `market_count()` + `markets(i)`, a struct
 *     whose address words are classified by probing, not assumed).
 *
 * The position grain is `(controller, user)` — each controller is an ISOLATED
 * market (one collateral, one borrowed token), and a user's positions across
 * controllers are margined and liquidated independently: one page per user
 * would assert a single health across markets that share nothing. Analogous to
 * Dolomite's (owner, accountNumber) and Morpho's (market, user).
 *
 * Most markets borrow crvUSD (a $-pegged stable), so the AMM's own
 * `price_oracle()` — collateral priced in the borrowed token — is effectively
 * USD there. ⚠️ NOT all: a handful of oneway markets borrow WETH / tBTC /
 * ynETH / CRV instead, and those present in their own borrowed token — the
 * crvUSD ≈ $1 reading never applies to them. `borrowedIsCrvusd` is checked per
 * market from the factory's own answer, never assumed.
 */

/** The three live factories — discovery roots, verified by bytecode. */
export const LLAMALEND_ADDRESSES = {
  /** OneWayLendingFactory — V1 lend markets (`market_count()`). */
  ONEWAY_FACTORY: "0xea6876dde9e3467564acbee1ed5bac88783205e0",
  /** crvUSD ControllerFactory — V1 mint markets (`n_collaterals()`). */
  CRVUSD_FACTORY: "0xc9332fdcb1c491dcc683bae86fe3cb70360738bc",
  /** LlamaLend V2 Factory — `market_count()` + `markets(i)` (struct);
   *  `controllers(i)` reverts on it by design. */
  V2_FACTORY: "0x8f6b56ec5ddf1f2691a1059f1d3cd97ac9eab0bd",
  /** crvUSD — the borrowed token on every mint market and most lend markets. */
  CRVUSD: "0xf939e0a03fb07f59a73314e73794be0e57ac1b4e",
} as const;

/** monetary_policy rate() is a per-second rate at 1e18; APR by simple
 *  multiplication (the same reading Curve's own UI leads with). */
export const SECONDS_PER_YEAR = 31_536_000;

export type LlamalendVersion = "v1" | "v2";
export type LlamalendFactoryKind = "oneway" | "crvusd" | "v2";

/** The market's own vocabulary, per factory lineage. */
export const FACTORY_LABEL: Record<LlamalendFactoryKind, string> = {
  oneway: "V1 lend market",
  crvusd: "V1 mint market (crvUSD)",
  v2: "V2 market",
};

export const shortAddress = (addr: string): string => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

/** Canonical lowercase 0x-address form; null when the string is not one. */
export function normalizeAddressParam(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(s) ? s : null;
}

/** "wstETH / crvUSD" — collateral first, borrowed second: the market's own
 *  identity line (the controller address is THE key; this is display). */
export function marketPairLabel(collateralSymbol: string, borrowedSymbol: string): string {
  return `${collateralSymbol} / ${borrowedSymbol}`;
}
