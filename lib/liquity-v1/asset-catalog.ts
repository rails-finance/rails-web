// Liquity V1 (LUSD) contract catalog (chain-state tier).
// ----------------------------------------------------------------------------
// The original, frozen 2021 Liquity: a fixed set of singleton mainnet contracts,
// a single ETH collateral, and a single LUSD debt token. There is no reserve/market
// axis and no token list to resolve — collateral is always ETH (native), debt always
// LUSD — so this file holds only the protocol's own addresses (used as the
// `contract` on every provenance entry) plus the two fixed asset descriptors.

export const LIQUITY_V1_ADDRESSES = {
  /** TroveManager — emits TroveUpdated on liquidation / redemption paths. */
  TROVE_MANAGER: "0xa39739ef8b0231dbfa0dcda07d7e29faabcf4bb2",
  /** BorrowerOperations — emits TroveUpdated on open / adjust / close. */
  BORROWER_OPERATIONS: "0x24179cd81c9e782a4096035f7ec97fb8b783e007",
  /** StabilityPool — LUSD deposits absorb liquidated debt, earn ETH. */
  STABILITY_POOL: "0x66017d22b0f8556afdd19fc67041899eb65a21bb",
  /** PriceFeed — the protocol's own ETH:USD oracle (Chainlink + Tellor fallback).
   *  Named by TroveManager.priceFeed(); verified by scripts/verify-liquity-v1-chain.mjs. */
  PRICE_FEED: "0x4c517d4e2c851ca76d7ec94b805269df0f2201de",
  /** SortedTroves — the redemption-order list (descending nominal ICR).
   *  Named by TroveManager.sortedTroves(); verified by the same script. */
  SORTED_TROVES: "0x8fdd3fbfeb32b28fb73555518f8b361bcea741a6",
  /** MultiTroveGetter — batch reader over the sorted list (deployment helper;
   *  cross-checked against SortedTroves + TroveManager.Troves by the script). */
  MULTI_TROVE_GETTER: "0xfc92d0e9fa35df17e3a6d9f40716ca2ce749922b",
  /** LUSD stablecoin. */
  LUSD: "0x5f98805a4e8be255a32880fdec7f6728c6568ba0",
  /** LQTY token. */
  LQTY: "0x6dea81c8171d0ba574754ef6f8b412f2ed88c54d",
} as const;

/** Minimum collateral ratio — liquidatable below this (TroveManager.MCR, chain-
 *  verified constant). In recovery mode troves below the CCR are also at risk. */
export const LIQUITY_V1_MCR = 1.1;
/** Critical collateral ratio — the system enters recovery mode when the TOTAL
 *  collateral ratio falls below this (TroveManager.CCR, chain-verified constant). */
export const LIQUITY_V1_CCR = 1.5;

/** Collateral is always native ETH; debt is always LUSD — both 18 decimals. */
export const COLLATERAL_SYMBOL = "ETH";
export const DEBT_SYMBOL = "LUSD";
export const ASSET_DECIMALS = 18;
