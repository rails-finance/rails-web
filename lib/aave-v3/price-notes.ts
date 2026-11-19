// The words for an Aave V3-family reserve price as the app reads it: the
// market's AaveOracle (IAaveOracle getAssetPrice, USD with 8 decimals), the
// price the Pool values collateral at. One module, so every Aave V3 receipt
// (position cards on Ethereum, Base and Arbitrum, Seamless, the market and
// reserve pages) names a price the same way (ui-jobs 743).

const blockText = (block: number | null | undefined): string =>
  block != null ? `at block ${block.toLocaleString("en-US")}` : "at the latest read, which names no block";

/** One reserve's price: the oracle, the call and the block it was read at. */
export const aaveV3PriceNote = (oracle: string, symbol: string, block: number | null | undefined): string =>
  `${oracle} getAssetPrice(${symbol}) ${blockText(block)}, USD with 8 decimals`;

/** Ethereum's balance row: the index's balance, interest accrued to the
 *  latest block it has indexed, which the listing does not name. */
export const aaveV3IndexBalanceNote = (symbol: string, side: "supply" | "debt"): string =>
  `the index's ${symbol} ${side === "supply" ? "balance" : "debt"}, interest accrued to the index's latest read, which names no block`;

/** Where a receipt's balances and prices stand at two blocks (a listing row:
 *  the balances at the row's block, the prices at the latest when it was
 *  served). Empty where they share one, or where either is unstated. */
export const aaveV3BlocksNote = (balanceBlock: number | null | undefined, priceBlock: number | null | undefined) =>
  balanceBlock != null && priceBlock != null && balanceBlock !== priceBlock
    ? `The balances stand at block ${balanceBlock.toLocaleString("en-US")} and the prices at block ${priceBlock.toLocaleString("en-US")}.`
    : "";

/** A Lifetime flows line on a lane whose day rows rails-server sums (Aave V3
 *  on Ethereum, SparkLend): its receipt names no legs. */
export const AAVE_V3_SERVED_NOTE =
  "Each day's figure is summed by rails-server from its stored prices, a leg with none at its block at a fallback price; its day rows name no legs.";

/** How the face shows a figure the rows rebuild to the cent. */
export const AAVE_V3_FACE_NOTE = {
  dollars: "To the cent, shown to the dollar.",
  compact: "To the cent, shown compact, with the cents on hover.",
  cents: "",
} as const;
export type AaveV3Face = keyof typeof AAVE_V3_FACE_NOTE;
