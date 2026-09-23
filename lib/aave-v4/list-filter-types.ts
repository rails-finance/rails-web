// Aave V4 listing filter enums + dust constant + visibility helpers. The filter
// SELECTION shape itself (AaveV4ListFilters) lives with the dimension registry in
// lib/aave-v4/list-filter-dimensions; this file holds the leaf types that both the
// registry and the fetch-param mapper share.

export type AaveV4Debt = "all" | "withDebt" | "noDebt";
// "underwater" = HF < 1.0 (liquidatable — a factual on-chain state, not a risk
// opinion). No "at risk" band: Rails doesn't editorialize where a still-healthy
// position sits; the HF value carries that.
export type AaveV4Health = "all" | "underwater";
/** Tri-state liquidation filter. "with" → positions liquidated at least
 *  once, "without" → positions never liquidated, "all" → no restriction. */
export type AaveV4Liquidations = "all" | "with" | "without";
/** Visibility tier — now dust-only. The open/closed/liquidated axis moved to the
 *  first-class Status filter (see listing-visibility.ts / migration 057); the two
 *  can't independently own "closed" (a USD "$0" cut would strip the very closed
 *  rows a Status=Closed selection asks for). So this narrowed to: "nodust" hides
 *  positions under the dust line; "all" shows everything (the default). */
export type AaveV4Show = "all" | "nodust";

/** Dust line for the "Hide dust" toggle — combined supply + debt below this (USD)
 *  is hidden. Applies within the (open) positions that Status already admits. */
export const AAVE_V4_DUST_USD = 100;

/** Dust visibility default — always "all" (show everything). Dust hiding is an
 *  explicit opt-in, not a contextual default; the open/closed axis it used to
 *  carry now lives on the Status filter (listing-visibility.ts). */
export function aaveV4ShowDefault(): AaveV4Show {
  return "all";
}

export function effectiveAaveV4Show(f: { show?: AaveV4Show }): AaveV4Show {
  return f.show ?? aaveV4ShowDefault();
}
