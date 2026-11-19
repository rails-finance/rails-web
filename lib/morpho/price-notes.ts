// The words for a Morpho Blue dollar price as the app reads it (ui-jobs 743).
// Blue states no USD: a market's oracle quotes the collateral in the loan
// token, and the loan token's dollar price is read beside it at the same
// block, from an AaveOracle (Arbitrum, and Optimism where Chainlink has no
// feed) or a Chainlink feed (Arc, Optimism). One module, so the Arbitrum
// dollar line and the Arc and Optimism cards and wallets name a price the
// same way.

const blockText = (block: number | null | undefined): string =>
  block != null ? `at block ${block.toLocaleString("en-US")}` : "at the latest read, which names no block";

/** A loan token's price from an AaveOracle. */
export const morphoAaveOraclePriceNote = (oracle: string, symbol: string, block: number | null | undefined): string =>
  `${oracle} getAssetPrice(${symbol}) ${blockText(block)}, USD with 8 decimals`;

/** A loan token's price from a Chainlink feed. */
export const morphoChainlinkPriceNote = (
  feed: string,
  block: number | null | undefined,
  decimals: number | null | undefined,
): string => `Chainlink ${feed} latestRoundData ${blockText(block)}${decimals != null ? `, ${decimals} decimals` : ""}`;

/** The composed collateral price: the market oracle's price in the loan
 *  token times the loan token's dollar price, each as shown, with the read
 *  behind each. */
export const morphoCollateralPriceNote = (o: {
  collateral: string;
  loan: string;
  /** The market oracle's price as shown, and its block. */
  oracleText: string;
  oracleBlock: number | null | undefined;
  /** The loan price as shown, and the note of its read. */
  loanText: string;
  loanNote: string;
}): string =>
  `${o.collateral} → USD = the market oracle's price in ${o.loan} × ${o.loan}'s USD price, each as shown: ${o.oracleText} ${o.loan} (the market oracle's price() ${blockText(o.oracleBlock)}) × ${o.loanText} (${o.loanNote})`;

/** How the face shows a figure the rows rebuild to the cent. */
export const MORPHO_FACE_NOTE = {
  dollars: "To the cent, shown to the dollar.",
  cents: "",
} as const;
export type MorphoFace = keyof typeof MORPHO_FACE_NOTE;
