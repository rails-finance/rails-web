// ============================================================================
// FETCH LLAMALEND POSITION (chain state)
// ============================================================================
//
// Per-POSITION state read directly from the market's own contracts at the
// live head — THE soft-liquidation surface, and the risk companion to the
// captured event replay. The grain is (controller, user): each controller is
// an isolated market, so one fetch covers exactly one risk unit and never
// aggregates a user across markets.
//
// ONE multicall per position:
//   • Controller.user_state(user) → (collateral, stablecoin, debt, N).
//     `stablecoin` is the headline: collateral the LLAMMA AMM has ALREADY
//     converted to the borrowed token for this user — > 0 means the position
//     is in soft-liquidation RIGHT NOW. It lives in NO event; only this state
//     read carries it.
//   • AMM.get_sum_xy(user) → the cross-check: a SECOND contract's statement
//     of the same split — get_sum_xy(user).x must equal user_state.stablecoin
//     exactly (measured wei-exact on 130/130 in-soft-liq positions), and the
//     response says whether it did.
//   • AMM.read_user_tick_numbers(user) → (n1, n2), SIGNED band indices;
//     with A and get_base_price they give the band via the exact integer
//     p_oracle_up port: pUp (soft-liq onset) and pDown (fully liquidated).
//   • AMM.price_oracle() → the collateral's price in the BORROWED token
//     (1e18) — health = price_oracle ÷ pUp (1.0 exactly at onset).
//
// ⚠️ CLOSED positions read user_state = [0, 0, 0, N] with STALE ticks (and
// the Controller's health()/user_prices() REVERT on them) — so debt == 0 is
// "no live loan", and no band/tick figure is ever rendered from that state.
//
// ⚠️ UNITS: prices and band edges are 1e18 in the BORROWED token. That is
// effectively USD only where the borrowed token IS crvUSD (~$1) — a handful
// of markets borrow WETH / tBTC / ynETH / CRV instead and present in their
// own token (`borrowedIsCrvusd` travels on the response).

import type { LlamalendVersion } from "@/lib/llamalend/asset-catalog";

export interface LlamalendChainResponse {
  /** The isolated market's key. */
  controller: string;
  user: string;
  amm: string;
  blockNumber: number;

  // Market identity (from the factories' own answers).
  version: LlamalendVersion;
  collateralSymbol: string;
  collateralDecimals: number;
  borrowedSymbol: string;
  borrowedDecimals: number;
  borrowedIsCrvusd: boolean;
  /** Amplification — immutable; band density. */
  A: number;

  /** debt > 0 at head. False for closed positions (user_state reads
   *  [0,0,0,N] with STALE ticks there — nothing below renders). */
  hasLoan: boolean;

  // user_state legs (null when hasLoan is false).
  /** Collateral still held as collateral (collateral-token units). */
  collateral: number | null;
  collateralRaw: string | null;
  /** ⇒ THE DISTINCTIVE FIGURE: collateral the AMM has already converted to
   *  the borrowed token (borrowed-token units). > 0 = in soft-liquidation. */
  converted: number | null;
  convertedRaw: string | null;
  /** Debt (borrowed-token units). */
  debt: number | null;
  debtRaw: string | null;
  /** Band count N. */
  bands: number | null;

  /** In soft-liquidation NOW (converted > 0 with a live loan). */
  inSoftLiq: boolean;
  /** Everything is converted (collateral == 0 with converted > 0) — the band
   *  is fully crossed; the next stop is hard liquidation. */
  fullyConverted: boolean;

  /** AMM.get_sum_xy(user).x — the second contract's own statement of the
   *  converted amount, for the receipt. */
  sumXyXRaw: string | null;
  /** sumXyX == user_state.stablecoin, wei-exact — the anti-synthesis proof. */
  convertedCrossCheckExact: boolean | null;

  // Band geometry (exact integer math from the same multicall's A,
  // base_price and SIGNED ticks; null when hasLoan is false).
  n1: string | null;
  n2: string | null;
  /** p_oracle_up(n1) — soft-liq ONSET price (borrowed token per collateral). */
  pUp: number | null;
  pUpRaw: string | null;
  /** p_oracle_down(n2) — FULLY-liquidated price. */
  pDown: number | null;
  pDownRaw: string | null;
  basePriceRaw: string | null;

  /** AMM.price_oracle() — collateral in the borrowed token (1e18, scaled). */
  priceOracle: number | null;
  priceOracleRaw: string | null;
  /** price_oracle ÷ pUp — 1.0 exactly at soft-liq onset; below 1 the band is
   *  being crossed. A ratio of two same-unit prices. */
  health: number | null;

  /** True when the chain read failed and this is an empty stub. */
  chainStale: boolean;
}

export interface FetchLlamalendPositionParams {
  controller: string;
  user: string;
  baseUrl?: string;
}

export async function fetchLlamalendChainPosition(p: FetchLlamalendPositionParams): Promise<LlamalendChainResponse> {
  const qs = new URLSearchParams({ controller: p.controller, user: p.user });
  const url = `${p.baseUrl ?? ""}/api/chain/llamalend/position?${qs.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`fetchLlamalendChainPosition failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as LlamalendChainResponse;
}
