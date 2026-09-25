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

/** Keyed by `ProtocolEntry.id`; absent means the explorer prices in USD or has
 *  not been ruled out. */
export const ORACLE_USD_REASON: Record<string, string> = {
  fluid:
    "debt-token units by design — each vault's oracle prices the collateral in the vault's debt token (the exact space its liquidation engine judges in); Fluid runs no USD feed",
  frankencoin:
    "oracle-free by design — the liquidation price is owner-declared and enforced by challenge auctions; no USD feed exists anywhere in the protocol",
  maple:
    "Maple runs an oracle, and for USDC that oracle IS a $1 pin: getLatestPrice returns a governance-set manualOverridePrice of exactly 1e8, overriding the registered feed (for USDT it reverts — no price at all). Rendering it would launder a pin as a market reading, which is what a $1 pin is charter-forbidden for; the pool assets ARE the unit, so values render in the asset itself",
  morpho: "loan-token units by design — Morpho Blue has no USD oracle",
  "morpho-base": "loan-token units by design — Morpho Blue has no USD oracle",
  pwn: "no protocol oracle — the two parties set the price",
  "aave-vaults":
    "a vault share has no protocol oracle to value it — the one priced figure is the census's, the balance through the vault's own convertToAssets and the chain's Aave V3 oracle on the ASSET at that block",
  yearn:
    "72 distinct assets across the roster and no per-asset feed to value them against, so every figure stays in the vault's own asset and no two assets are ever added together",
};
