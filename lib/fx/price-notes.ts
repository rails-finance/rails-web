// f(x)'s price wording for its dollar receipts (ui-jobs 743): every price is
// a leg of the pool's price oracle at a named block. The anchor leg is the one
// getPositionDebtRatio divides by (the LTV); the min leg is getLiquidatePrice,
// the one the pool judges its lines against.

export type FxLeg = "anchor" | "min";

const blockText = (block: number | null | undefined): string =>
  block != null ? `at block ${block.toLocaleString("en-US")}` : "at a block this read does not name";

/** The leg, the call that gives it, and its block. */
export function fxPriceNote(leg: FxLeg, block: number | null | undefined): string {
  return leg === "anchor"
    ? `the pool oracle's anchor leg (getPrice), the price the LTV divides by, ${blockText(block)}`
    : `the pool oracle's min leg (getLiquidatePrice), the price the pool judges its lines against, ${blockText(block)}`;
}

/** Where the collateral and the price stand at different blocks. */
export const fxBlocksNote = (collsBlock: number, priceBlock: number): string =>
  `The collateral stands at block ${collsBlock.toLocaleString("en-US")} and the price at block ${priceBlock.toLocaleString("en-US")}.`;
