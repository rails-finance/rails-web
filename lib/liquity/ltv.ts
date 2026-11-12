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

// ── Each deployment's terms ────────────────────────────────────────────────
// Liquity V2 and the forks that share its card, sheet and panes each take
// their own docs' words (decision 0065; reference/official-docs/<family>.md,
// Terms), so the families differ on purpose. A figure the docs do not name
// keeps Rails's coined label.

/** The Liquity V2 deployments that share the card, the sheet and the panes. */
export type LiquityFamilyTermsId = "liquity-v2" | "ebisu" | "asymmetry" | "basedollar";

export interface LiquityFamilyTerms {
  /** The docs state a Trove's risk as LTV, debt ÷ collateral value, against
   *  a Max LTV (1 ÷ MCR); false, as a collateral ratio against its minimum. */
  ltv: boolean;
  /** The Trove's ratio as a label ("LTV", "Collateralization ratio"). */
  ratio: string;
  /** The same in a sentence ("LTV", "collateralization ratio"). */
  ratioText: string;
  /** The branch's limit as a label ("Max LTV", "Minimum Collateral Ratio"). */
  limit: string;
  /** The same in a sentence ("Max LTV", "Minimum Collateral Ratio (MCR)"). */
  limitText: string;
  /** Whom a Trove's rate is delegated to, in a sentence ("delegate"). */
  delegate: string;
  /** The docs' plain words for the delegate, given once where it is
   *  explained ("a third party manager"). */
  delegateGloss?: string;
  /** The fee drawing debt adds, as a label. */
  upfrontFee: string;
  /** The same in a sentence. */
  upfrontFeeText: string;
  /** The redeemer's fee left in a redeemed Trove, as a label. */
  redemptionFee: string;
  /** A Trove under the minimum debt, as a status word ("Dormant", "Zombie"). */
  dormant: string;
  /** The same after "makes it" ("dormant", "a zombie position"). */
  dormantText: string;
  /** The same as a noun ("dormant Trove", "zombie position"). */
  dormantNoun: string;
  /** The price that liquidates a Trove, as a label. */
  liquidationPrice: string;
  /** One collateral's market, as a label or a first mention ("branch",
   *  "borrow market"). */
  branch: string;
  /** The branch ratio below which borrowing is restricted, as a label. */
  ccr: string;
}

const LIQUITY_V2_TERMS: LiquityFamilyTerms = {
  ltv: true,
  ratio: "LTV",
  ratioText: "LTV",
  limit: "Max LTV",
  limitText: "Max LTV",
  delegate: "delegate",
  upfrontFee: "Upfront Borrowing Fee",
  upfrontFeeText: "Upfront Borrowing Fee",
  redemptionFee: "Redemption fee",
  dormant: "Dormant",
  dormantText: "dormant",
  dormantNoun: "dormant Trove",
  liquidationPrice: "Liquidates at",
  branch: "branch",
  ccr: "Critical Collateral Ratio (CCR)",
};

/** The words the forks shared before their docs were read. */
const FORK_TERMS: LiquityFamilyTerms = {
  ltv: false,
  ratio: "Collateral ratio",
  ratioText: "collateral ratio",
  limit: "Minimum ratio",
  limitText: "minimum",
  delegate: "batch manager",
  upfrontFee: "Upfront fee",
  upfrontFeeText: "one-time borrowing fee",
  redemptionFee: "Fee kept",
  dormant: "Dormant",
  dormantText: "dormant",
  dormantNoun: "dormant Trove",
  liquidationPrice: "Liquidates at",
  branch: "branch",
  ccr: "Critical ratio",
};

export const LIQUITY_FAMILY_TERMS: Record<LiquityFamilyTermsId, LiquityFamilyTerms> = {
  "liquity-v2": LIQUITY_V2_TERMS,
  // Basedollar's docs host does not answer; by the standing ruling it rests
  // on Liquity V2's docs (reference/official-docs/basedollar.md).
  basedollar: LIQUITY_V2_TERMS,
  // docs.asymmetry.finance: LTV and the maximum LTV, a "third party manager"
  // or delegate, the "liquidation reserve", the "borrow market", TCR and CCR.
  // The docs deny an upfront fee and charge "a fee corresponding to 7 days of
  // average interest".
  asymmetry: {
    ...LIQUITY_V2_TERMS,
    delegateGloss: "a third party manager",
    upfrontFee: "7-day interest fee",
    upfrontFeeText: "7-day interest fee",
    branch: "borrow market",
  },
  ebisu: FORK_TERMS,
};

/** A deployment's terms, by its id or its display name ("Liquity V2",
 *  "Base Dollar"). */
export function liquityFamilyTerms(family: string): LiquityFamilyTerms {
  const key = family.toLowerCase().replace(/[\s-]+/g, "");
  return LIQUITY_FAMILY_TERMS[(key === "liquityv2" ? "liquity-v2" : key) as LiquityFamilyTermsId] ?? FORK_TERMS;
}

/** A Trove's ratio in its deployment's terms, from the collateral ratio in
 *  percent: the LTV (10000 ÷ CR) or the CR itself. Null where the ratio is
 *  not a positive finite figure. */
export function familyRatioPct(t: LiquityFamilyTerms, crPct: number | null | undefined): number | null {
  if (crPct == null || !isFinite(crPct) || crPct <= 0) return null;
  return t.ltv ? 10000 / crPct : crPct;
}
