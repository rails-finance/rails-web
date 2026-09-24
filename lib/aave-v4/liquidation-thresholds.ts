/**
 * Aave V4 liquidation-threshold helpers, and the dollar-rail rule.
 *
 * There is intentionally NO hardcoded per-spoke LT table here any more. The
 * threshold a position is liquidated at is the EFFECTIVE collateral factor,
 * which an e-mode or correlated venue lifts above the reserve's static
 * getDynamicReserveConfig.collateralFactor (Core WETH: 0.83 config, 0.92
 * effective), and getReserve / getReserveConfig report collateralRisk = 0, so
 * the only trustworthy source is the chain itself. The server now harvests the true LT for each (spoke,
 * reserve) from getUserAccountData.avgCollateralFactor on single-collateral
 * positions (rails-server-onboarding chain-refresher harvest-lt) and writes it to
 * aave_v4_reserves.liquidation_threshold; it rides the wire on every chain
 * reserve as `reserves[].lt`. The position calculation reads that value (see
 * patchReservesWithChain / patchSpokeCardWithChain). The earlier `LT_BY_SPOKE`
 * hand-maintained table had drifted stale-low by up to 800bps and is gone.
 *
 * `AAVE_V4_FALLBACK_LT` is the single conservative value used only in the rare
 * no-chain fallback (a position whose chain read failed / never ran, so no
 * per-reserve lt is available). It's intentionally pessimistic so the
 * calculation's HF / liq price never flatters such a position.
 */

/** Conservative LT used only when no chain-state LT is available for a reserve. */
export const AAVE_V4_FALLBACK_LT = 0.7;

/**
 * The dollar-rail rule (rails-ops TO-DO-ui-jobs §41).
 *
 * A $1 rail is a collateral the position's liquidation figures hold at one
 * dollar, so those figures describe the OTHER collateral's fall. An asset is a
 * rail because its own oracle price at the page's block sits at $1 — never
 * because its name looks like a dollar. The earlier `STABLE_SYMBOLS` list held
 * sUSDe ($1.249) and EURC ($1.137) as rails; a name list cannot see a
 * yield-bearing or euro asset, and it cannot see a depeg.
 *
 * The band is ±2%. A fiat or synthetic dollar the V4 oracle prices reads
 * 0.9997–1.0001 in calm markets (USDC, USDT, DAI, GHO, USDe, USDG, RLUSD,
 * frxUSD on 2026-09-24); the nearest non-dollar asset sits 13% away (EURC).
 * A stable in a depeg (USDC at ~$0.87 over the SVB weekend) falls outside the
 * band and stops being a rail, which is the point: a falling asset is one the
 * figures have to describe, not one they may hold still.
 */
export const DOLLAR_RAIL_BAND = 0.02;

/** Whether an asset is a $1 rail at this price. `null` (no price source) is
 *  never a rail: an asset Rails cannot price is one it cannot hold at a dollar
 *  either (RULE: Rails never invents a price — lib/aave-v4/unpriced.ts). */
export function isDollarRail(priceUsd: number | null | undefined): boolean {
  return priceUsd != null && Math.abs(priceUsd - 1) <= DOLLAR_RAIL_BAND;
}
