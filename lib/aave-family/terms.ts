// The Aave-family explorers' words for the protocol's concepts, per family
// (rails-ops decision 0065; ui-jobs 611). Each family takes its docs' term in
// its docs' spelling; Seamless, whose docs host is gone, takes Aave V3's
// (0065 point 10). The terms tables are
// rails-ops reference/official-docs/{aave-v3,spark,seamless,aave-v4}.md.
//
// Pure, with one type import, so a unit test can read it.

import type { AaveMarketKey } from "@/lib/shared/aave-market-configs";
import { aprToApy } from "@/lib/aave-family/apy";

export type AaveFamilyId = "aave-v3" | "spark" | "seamless";

export interface AaveFamilyTerms {
  /** How a reserve's rate is stated: the Pool's stored rate as an APR, or
   *  compounded each second into an APY (lib/aave-family/apy.ts). */
  rateForm: "apr" | "apy";
  /** The column, stat and row labels. */
  supplyRate: string;
  borrowRate: string;
  /** The same in running prose. */
  supplyRateText: string;
  borrowRateText: string;
  /** The rate in a receipt's or an export's suffix: "APR" or "APY". */
  rateUnit: "APR" | "APY";
  utilization: string;
  utilizationText: string;
  /** The utilization the rate model turns at. */
  kink: string;
  kinkText: string;
  /** Efficiency mode, short and long. */
  emode: string;
  emodeLong: string;
}

// aave.com: "supply rate", "borrow rate", "utilization", "optimal utilization
// point", "Efficiency Mode (E-Mode)".
const AAVE_V3_TERMS: AaveFamilyTerms = {
  rateForm: "apr",
  supplyRate: "Supply rate",
  borrowRate: "Borrow rate",
  supplyRateText: "supply rate",
  borrowRateText: "borrow rate",
  rateUnit: "APR",
  utilization: "Utilization",
  utilizationText: "utilization",
  kink: "Optimal utilization",
  kinkText: "optimal utilization",
  emode: "E-Mode",
  emodeLong: "Efficiency Mode",
};

export const AAVE_FAMILY_TERMS: Record<AaveFamilyId, AaveFamilyTerms> = {
  "aave-v3": AAVE_V3_TERMS,
  seamless: AAVE_V3_TERMS,
  // docs.spark.finance: "Supply APY", "Borrow APY", "utilization", "the
  // model's kink", "High Efficiency Mode (E-mode)".
  spark: {
    rateForm: "apy",
    supplyRate: "Supply APY",
    borrowRate: "Borrow APY",
    supplyRateText: "supply APY",
    borrowRateText: "borrow APY",
    rateUnit: "APY",
    utilization: "Utilization",
    utilizationText: "utilization",
    kink: "Kink",
    kinkText: "kink",
    emode: "E-mode",
    emodeLong: "High Efficiency Mode",
  },
};

/** Aave V4's words (ui-jobs 627; rails-ops reference/official-docs/aave-v4.md,
 *  Terms): aave.com/docs/aave-v4 says "supply APY" and "borrow APY",
 *  "utilization", "optimal usage ratio", "Collateral Factor", "supply caps,
 *  borrow caps", "Spoke", "liquidation price", "Target Health Factor",
 *  "max-bonus threshold", "Dynamic Config". V4 has no E-Mode, so it keeps a
 *  record of its own beside the Aave V3 Pools'. The rates are the hub's stored
 *  drawn rate compounded each second (lib/aave-family/apy.ts): the hub accrues
 *  its drawn index linearly between updates and carries it forward at each
 *  one, so the year's growth is the compounded rate. */
export const AAVE_V4_TERMS = {
  rateForm: "apy",
  supplyRate: "Supply APY",
  borrowRate: "Borrow APY",
  supplyRateText: "supply APY",
  borrowRateText: "borrow APY",
  rateUnit: "APY",
  utilization: "Utilization",
  utilizationText: "utilization",
  kink: "Optimal usage ratio",
  kinkText: "optimal usage ratio",
  collateralFactor: "Collateral factor",
  collateralFactorText: "collateral factor",
  supplyCap: "Supply cap",
  borrowCap: "Borrow cap",
  spokes: "Spokes",
  liquidationPrice: "Liquidation price",
  targetHealthFactor: "Target health factor",
  maxBonusThreshold: "Max-bonus threshold",
  dynamicConfig: "Dynamic Config",
} as const satisfies Omit<AaveFamilyTerms, "emode" | "emodeLong"> & Record<string, string>;

/** A family's terms by its id, a market key or a page's market word (every
 *  Aave V3 Pool reads Aave's). */
export function aaveFamilyTerms(
  key: AaveFamilyId | AaveMarketKey | "Aave V3" | "Seamless" | (string & {}),
): AaveFamilyTerms {
  if (key === "spark") return AAVE_FAMILY_TERMS.spark;
  if (key === "seamless" || key === "Seamless") return AAVE_FAMILY_TERMS.seamless;
  return AAVE_FAMILY_TERMS["aave-v3"];
}

/** A reserve's rate (the Pool's stored rate as a fraction a year) in the
 *  family's form: unchanged as an APR, compounded as an APY. */
export function familyRate(t: Pick<AaveFamilyTerms, "rateForm">, apr: number): number;
export function familyRate(t: Pick<AaveFamilyTerms, "rateForm">, apr: number | null | undefined): number | null;
export function familyRate(t: Pick<AaveFamilyTerms, "rateForm">, apr: number | null | undefined): number | null {
  if (apr == null) return null;
  return t.rateForm === "apy" ? (aprToApy(apr) ?? apr) : apr;
}

/** A family's terms from the Pool identity a card's receipts name
 *  (lib/aave-v3/pool-context.tsx): SparkLend's Pool by its name, Seamless by
 *  its protocol, Aave V3 otherwise. */
export function aaveFamilyTermsOfPool(pool: { protocol?: string; name?: string } | undefined): AaveFamilyTerms {
  if (pool?.protocol === "Seamless") return AAVE_FAMILY_TERMS.seamless;
  if (pool?.name && /spark/i.test(pool.name)) return AAVE_FAMILY_TERMS.spark;
  return AAVE_FAMILY_TERMS["aave-v3"];
}
