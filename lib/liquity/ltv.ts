// Liquity V2 states a Trove's risk as its LTV, the debt over the collateral's
// dollar value, and each branch's limit as its Max LTV (rails-ops decision
// 0065; reference/official-docs/liquity-v2.md, Terms). The contracts work the
// inverse: the collateral ratio (getCurrentICR) against the branch's MCR. Rails
// reads those and shows 1 ÷ them; a receipt keeps the contract's value as its
// input. The branch-wide ratios (TCR, CCR, SCR) keep the docs' names and
// direction.

import type { ProvInput } from "@/components/shared/provenance";
import { LIQUITY_V2_BRANCHES } from "@/lib/liquity/asset-catalog";

/** The Trove card's label, in the docs' spelling. */
export const LTV_LABEL = "LTV";

/** The branch's MCR as a multiple (1.1 = 110%): the BorrowerOperations
 *  constant the catalog records. Null on an unknown branch. */
export function liquityV2Mcr(collateralType: string | undefined | null): number | null {
  if (!collateralType) return null;
  const key = (collateralType === "ETH" ? "WETH" : collateralType).toLowerCase();
  return LIQUITY_V2_BRANCHES[key]?.mcr ?? null;
}

/** The branch's Max LTV in percent: 1 ÷ MCR (90.91 on WETH). */
export function liquityV2MaxLtvPct(collateralType: string | undefined | null): number | null {
  const mcr = liquityV2Mcr(collateralType);
  return mcr != null && mcr > 0 ? 100 / mcr : null;
}

/** An LTV in percent from a collateral ratio in percent (150 → 66.67). Null
 *  where the ratio is not a positive finite figure: a Trove with no debt. */
export function ltvPct(crPct: number | null | undefined): number | null {
  return crPct != null && isFinite(crPct) && crPct > 0 ? 10000 / crPct : null;
}

/** An LTV or Max LTV as the page prints it. */
export function fmtLtv(pct: number, decimals = 1): string {
  return `${pct.toFixed(decimals)}%`;
}

/** The Max LTV as the docs print it: two places (90.91%, 83.33%). */
export function fmtMaxLtv(collateralType: string | undefined | null): string | null {
  const m = liquityV2MaxLtvPct(collateralType);
  return m != null ? fmtLtv(m, 2) : null;
}

/** The liquidation price in LTV terms. */
export const LTV_LIQUIDATION_PRICE_FORMULA = "debt ÷ (collateral × Max LTV), Max LTV = 1 ÷ MCR";

/** The liquidation price's receipt sentence. */
export function ltvLiquidationPriceSummary(symbol: string, collateralType: string): string {
  const max = fmtMaxLtv(collateralType);
  return `Liquidation price — the ${symbol} price at which the trove's LTV would reach the branch's Max LTV${max ? ` of ${max}` : ""}. Below that price the trove can be liquidated.`;
}

/** The branch's MCR as a receipt input: the contract's value the Max LTV is
 *  worked from. */
export function mcrInput(collateralType: string): ProvInput {
  const mcr = liquityV2Mcr(collateralType);
  return {
    label: "MCR",
    value: mcr != null ? `${Math.round(mcr * 100)}%` : "—",
    kind: "chain",
    pclass: "state",
    note: "BorrowerOperations MCR, the branch constant; Max LTV = 1 ÷ MCR",
  };
}

/** The branch's Max LTV as a receipt input, worked from the MCR. */
export function maxLtvInput(collateralType: string): ProvInput {
  return {
    label: "Max LTV",
    value: fmtMaxLtv(collateralType) ?? "—",
    kind: "derived",
    note: "1 ÷ MCR",
  };
}
