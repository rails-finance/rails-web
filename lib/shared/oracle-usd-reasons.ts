// Why an explorer states no USD figure, keyed by `ProtocolEntry.id`.
// ----------------------------------------------------------------------------
// Two surfaces say this, and they have to say the same thing: the coverage
// matrix's `oracleUsd: { why }` cell (lib/shared/coverage.ts) and the price
// dropdown on a position view (components/shared/latest-prices.tsx), which
// lists what the position holds and then states why there is no dollar figure
// beside it. The text lives here so both read one string.
//
// A reason is a fact about the protocol, not about the explorer's progress: it
// belongs here only where the protocol runs no USD feed Rails could read. An
// explorer that simply has not wired its prices yet has no entry and keeps the
// generic sentence, which is what "yet" is for.
//
// Rails renders no price the protocol does not state, so a position on one of
// these explorers carries its assets in the protocol's own unit — the vault's
// debt token, the market's loan token, the vault's own asset — or with no
// figure at all.

import { FLUID_BASE_DOLLARS } from "@/lib/fluid-base/dollars";

/** Keyed by `ProtocolEntry.id`; absent means the explorer prices in USD or has
 *  not been ruled out. */
const UNISWAP_REASON =
  "a pool prices itself: every figure is in the pool's quote token at the pool's price, and Uniswap runs no USD feed";
const PANCAKESWAP_REASON =
  "a pool prices itself: every figure is in the pool's quote token at the pool's price, CAKE is stated in CAKE, and PancakeSwap runs no USD feed";

export const ORACLE_USD_REASON: Record<string, string> = {
  fluid:
    "debt-token units by design: each vault's oracle prices the collateral in the vault's debt token (the space its liquidation engine judges in); Fluid runs no USD feed",
  frankencoin:
    "oracle-free by design: the liquidation price is owner-declared and enforced by challenge auctions; no USD feed exists anywhere in the protocol",
  maple:
    "USDC and USDT amounts are shown in the token, with no dollar price: Maple's USDC price is a fixed $1 set by its governance, and it states none for USDT",
  morpho:
    "prices are in the market's loan token (each market's oracle quotes the collateral in it), so the loan token has no price; Morpho Blue has no USD oracle",
  "morpho-arbitrum":
    "prices are in the market's loan token, which each market's oracle quotes the collateral in; Morpho Blue has no USD oracle, so the wallet's dollar totals convert the loan token at the Aave V3 Arbitrum oracle's price",
  "morpho-base":
    "prices are in the market's loan token (each market's oracle quotes the collateral in it), so the loan token has no price; Morpho Blue has no USD oracle",
  pwn: "no protocol oracle: the two parties set the price",
  "aave-vaults":
    "a vault share has no protocol oracle to value it. The one priced figure is the census's: the balance through the vault's convertToAssets and the chain's Aave V3 oracle on the asset at that block",
  "sky-savings":
    "Sky has no price oracle for USDS, so amounts show in USDS and their dollar value goes through the LitePSM, Sky's USDS–USDC swap: one USDS is 1 ÷ (1 + exit fee) USDC, and the fee has been zero for the whole life of sUSDS. Lifetime flows count USDC as one dollar; the home page's value held prices it at the Aave V3 oracle.",
  yearn:
    "72 distinct assets across the roster and no per-asset feed to value them against, so every figure stays in the vault's asset and no two assets are ever added together",
  "uniswap-v3":
    "a pool prices itself: every figure is in the pool's quote token at the pool's price, and Uniswap runs no USD feed",
  "uniswap-v4":
    "a pool prices itself: every figure is in the pool's quote token at the pool's price, and Uniswap runs no USD feed",
  "uniswap-v3-base": UNISWAP_REASON,
  "uniswap-v3-arbitrum": UNISWAP_REASON,
  "uniswap-v4-arbitrum": UNISWAP_REASON,
  "pancakeswap-v3-base": PANCAKESWAP_REASON,
  "pancakeswap-v3-arbitrum": PANCAKESWAP_REASON,
  lido: "a stake is ETH at Lido's share rate, and Lido runs no USD feed, so every figure is in ETH",
  "balancer-v3":
    "a pool share is a claim on the pool's tokens, and Balancer runs no USD feed, so every figure is in the pool's own tokens",
  "balancer-v3-arbitrum":
    "a pool share is a claim on the pool's tokens, and Balancer runs no USD feed, so every figure is in the pool's own tokens",
  aerodrome:
    "a pool prices itself: every figure is in the pool's quote token at the pool's price, AERO through Aerodrome's own AERO pools, and Aerodrome runs no USD feed",
  "aave-v4-arc":
    "each spoke's oracle prices every reserve in USD, so a balance's dollar value is its amount at that oracle's price at the block the page reads",
  "fluid-base": FLUID_BASE_DOLLARS
    ? "each vault's oracle prices the collateral in the vault's debt token and Fluid runs no USD feed, so a side's dollar value is its amount at the Aave V3 Base oracle's price at the head; a side Aave does not list, or a DEX-share side, stays in its own unit"
    : "debt-token units by design: each vault's oracle prices the collateral in the vault's debt token (the space its liquidation engine judges in); Fluid runs no USD feed",
};
