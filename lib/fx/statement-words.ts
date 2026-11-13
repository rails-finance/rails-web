// f(x)'s statements that the protocol's docs and the chain settle (rails-ops
// ui-jobs 637; reference/official-docs/fx.md, "Docs and chain disagree" 1, 2
// and 4): the keepers' bonus over the debt repaid, each pool's anchor price by
// its parts, and funding as a charge that is on or off. One module, so the
// position modal, the pool pages, the Prices modal, the event modals and the
// info page say each one the same way. Imports nothing through `@/`, so the
// unit tests (scripts/test/fx-statement-words.test.mjs) load it directly.

/** How a pool's oracle forms its anchor price: its parts in words, and where
 *  Rails has them from. Carried on the pool's catalog entry. */
export interface FxAnchorSource {
  /** The parts, multiplied, as a noun phrase: "The anchor is {words}." */
  words: string;
  /** "chain": an on-chain read reproduced the anchor from these parts;
   *  "docs": the parts are as f(x)'s docs give them. */
  basis: { kind: "chain"; block: number; check: string } | { kind: "docs"; page: string };
}

const pct = (r: number): string => `${(r * 100).toFixed(2).replace(/\.?0+$/, "")}%`;

// ── The bonus ────────────────────────────────────────────────────────────────

/** The keepers' bonus as the pool sets it: a share of the debt repaid
 *  (getRebalanceRatios / getLiquidateRatios, bonus ÷ 1e9). */
export function fxBonusClause(rebalanceBonus: number, liquidateBonus: number): string {
  return `${pct(rebalanceBonus)} over the debt repaid on a rebalance, ${pct(liquidateBonus)} on a liquidation`;
}

// ── The anchor ───────────────────────────────────────────────────────────────

/** "The anchor is …." for one pool. */
export function fxAnchorSentence(anchor: FxAnchorSource): string {
  return `The anchor is ${anchor.words}.`;
}

/** The same, naming the pool, for a page that lists both. */
export function fxPoolAnchorSentence(tokenSymbol: string, anchor: FxAnchorSource): string {
  return `The ${tokenSymbol} pool's anchor is ${anchor.words}.`;
}

/** The receipt's sentence on where the parts come from. */
export function fxAnchorBasis(anchor: FxAnchorSource): string {
  return anchor.basis.kind === "chain"
    ? `At block ${anchor.basis.block.toLocaleString("en-US")}, ${anchor.basis.check}`
    : `These parts are as f(x)'s docs give them (${anchor.basis.page}).`;
}

// ── Funding ──────────────────────────────────────────────────────────────────

/** The docs' condition and the rate, said once wherever funding is explained. */
export const FX_FUNDING_RULE =
  "By f(x)'s docs, funding is charged at Aave's USDC borrow rate while the Stability Pool is short of USDC, and is 0% otherwise.";

/** The live rate (getLongPoolFundingRatio, a yearly fraction) as a sentence
 *  around its figure, so a page can set the figure in bold. */
export function fxFundingNow(rate: number): { before: string; figure: string; after: string } {
  if (!(rate > 0)) return { before: "No funding is charged now: the rate is ", figure: "0.00%", after: " a year." };
  const p = rate * 100;
  const figure = p < 0.005 ? "under 0.01%" : `${p.toFixed(2)}%`;
  return { before: "Funding is charged on every position's collateral now, at ", figure, after: " a year." };
}

export function fxFundingNowText(rate: number): string {
  const s = fxFundingNow(rate);
  return `${s.before}${s.figure}${s.after}`;
}

/** The Funding rate label's tip, beside the live figure. */
export function fxFundingTip(rate: number): string {
  return rate > 0
    ? "A yearly charge on every position's collateral, charged now at Aave's USDC borrow rate. By f(x)'s docs, it is charged only while the Stability Pool is short of USDC"
    : "A yearly charge on every position's collateral, none now. By f(x)'s docs, it is charged at Aave's USDC borrow rate only while the Stability Pool is short of USDC";
}
