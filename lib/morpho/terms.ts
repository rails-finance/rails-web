// Morpho's words, as its documentation writes them (rails-ops decision 0065;
// ui-jobs 628). The terms table is rails-ops
// reference/official-docs/morpho.md, Terms.
//
// Rates: docs.morpho.org/learn/concepts/irm/ states a Borrow APY and a Supply
// APY, each the per-second rate compounded over a year,
// e^(rate × 31,536,000) − 1, the supply's per-second rate being the borrow's
// times utilization times (1 − fee). Rails reads the IRM's borrowRateView (the
// rate Morpho Blue charges over the time since the market's last update) and
// holds it as a rate a year, rate per second × 31,536,000, so the APY is
// e^(that) − 1.
//
// Pure, with no imports, so scripts/test/morpho-terms.test.mjs runs it.

/** The seconds in the year the docs compound over. */
export const MORPHO_SECONDS_PER_YEAR = 31_536_000;

/** The APY formula as a receipt states it. */
export const MORPHO_APY_FORMULA = "e^(rate per second × 31,536,000) − 1";

/** A rate a year (rate per second × 31,536,000, as a fraction) compounded as
 *  the docs state it: e^(rate a year) − 1. Null for a rate that is not a
 *  finite number ≥ 0. */
export function morphoApy(yearly: number): number;
export function morphoApy(yearly: number | null | undefined): number | null;
export function morphoApy(yearly: number | null | undefined): number | null {
  if (yearly == null || !Number.isFinite(yearly) || yearly < 0) return null;
  return Math.expm1(yearly);
}

/** The per-second rate the IRM returned (WAD, an integer string) behind a rate
 *  a year that Rails holds as `Number(raw) ÷ 1e18 × 31,536,000`. The integer
 *  is recovered exactly: a borrowRateView of under 2^53 survives the round
 *  trip through a double. */
export function morphoRatePerSecondRaw(yearly: number): string {
  return Math.round((yearly * 1e18) / MORPHO_SECONDS_PER_YEAR).toString();
}

/** The liquidation incentive factor the docs give for an LLTV:
 *  min(1.15, 1 ÷ (0.3 × LLTV + 0.7)). */
export const morphoLif = (lltv: number): number => Math.min(1.15, 1 / (0.3 * lltv + 0.7));

/** "1.0438": the factor at four places, as the docs print it. */
export const lifText = (lif: number): string => lif.toFixed(4);

/** "4.38% bonus": what the factor gives the liquidator over the debt repaid. */
export const lifBonusText = (lif: number): string => `${((lif - 1) * 100).toFixed(2)}% bonus`;

/** A market's name as the docs write it: the loan asset, then the collateral. */
export const morphoPair = (loan: string, collateral: string): string => `${loan} / ${collateral}`;

/** The labels and the words in sentences, in the docs' spelling. */
export const MORPHO_TERMS = {
  borrowRate: "Borrow APY",
  supplyRate: "Supply APY",
  borrowRateText: "borrow APY",
  supplyRateText: "supply APY",
  utilization: "Utilization",
  utilizationText: "utilization",
  utilized: "utilized",
  targetUtilization: "Target utilization",
  target: "target",
  healthFactor: "Health factor",
  lltv: "LLTV",
  /** The one place LLTV is spelled out: its tip. */
  lltvLong: "Liquidation Loan-To-Value",
  lif: "Liquidation Incentive Factor",
  marketLiquidity: "Market liquidity",
  loanAsset: "Loan asset",
  loanAssetText: "loan asset",
  loanAssets: "Loan assets",
} as const;

/** The LLTV's tip, the one place the term is spelled out. */
export const LLTV_TIP =
  "Liquidation Loan-To-Value: the most a position may owe against its collateral's value at the market's oracle, fixed when the market was created. Past it the position can be liquidated.";
