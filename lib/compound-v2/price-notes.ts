// The words for a Compound V2 price as the app reads it (ui-jobs 743): the
// oracle Comptroller.oracle() names at the block, its getUnderlyingPrice for
// the market's cToken, the price the Comptroller's liquidity and liquidation
// math reads. One module, so the position card, the price list, the
// liquidation legs and the Lifetime flows name a price the same way.

const n = (b: number) => b.toLocaleString("en-US");
const blockText = (block: number | null | undefined): string =>
  block != null ? `at block ${n(block)}` : "at the latest read, which states no block";

/** One market's price from the Comptroller's oracle. */
export const compoundV2PriceNote = (cSymbol: string, block: number | null | undefined): string =>
  `Comptroller oracle getUnderlyingPrice(${cSymbol}) ${blockText(block)}`;

/** A market priced by a constant stored in the oracle: its getConfig names
 *  no feed. */
export const compoundV2FixedPriceNote = (cSymbol: string, price: string, block: number | null | undefined): string =>
  `a constant in the Comptroller oracle, ${price}: getConfig(${cSymbol}) ${blockText(block)} names no price feed and this fixedPrice; nothing updates it`;

/** A price in the oracle's ETH years (before block 10,678,764), in ETH. */
export const compoundV2EthPriceNote = (cSymbol: string, block: number | null | undefined): string =>
  `${compoundV2PriceNote(cSymbol, block)}, in ETH (the oracle priced in ETH before block 10,678,764)`;

/** A debt line as the last borrow, repay or liquidation event emitted it. */
export const compoundV2LastEventDebtNote = (block: number | null | undefined): string =>
  block != null
    ? `the accountBorrows the market emitted at the last borrow, repay or liquidation event, block ${n(block)}`
    : "the accountBorrows the market emitted at the last borrow, repay or liquidation event, a block this read does not name";

/** How the face shows a figure the rows rebuild to the cent. */
export const COMPOUND_V2_FACE_NOTE = {
  dollars: "To the cent, shown to the dollar.",
  compact: "To the cent, shown compact, with the cents on hover.",
  cents: "",
} as const;
export type CompoundV2Face = keyof typeof COMPOUND_V2_FACE_NOTE;
