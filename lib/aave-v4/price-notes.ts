// The words for an Aave V4 price as the app reads it (ui-jobs 743). Every
// dollar figure stands on an on-chain price: the spoke oracle's
// getReservePrice, or the Chainlink read or Pendle TWAP the oracle map names
// for an asset no spoke oracle answers. An asset with none of them draws no
// dollars, and any total including it draws nothing. One module, so the
// position card, the listing, the markets and hubs pages and the peaks name a
// price the same way.

/** Where an on-chain price comes from, as the oracle map (`/api/oracle/aave-v4`)
 *  or a reserve read names it. */
export type AaveV4PriceSource = "iaave-oracle" | "chainlink" | "chainlink-eth-derived" | "pendle-twap" | "reserve";

const blockText = (block: number | null | undefined): string =>
  block != null ? `at block ${block.toLocaleString("en-US")}` : "at the latest read, which states no block";

/** One asset's price, named by its read and its block. */
export function aaveV4PriceNote(
  source: AaveV4PriceSource | null | undefined,
  symbol: string,
  block: number | null | undefined,
): string {
  switch (source) {
    case "chainlink":
      return `Chainlink ${symbol}/USD ${blockText(block)}`;
    case "chainlink-eth-derived":
      return `Chainlink ${symbol}/ETH × ETH/USD ${blockText(block)}`;
    case "pendle-twap":
      return `Pendle's on-chain PT oracle TWAP for ${symbol} ${blockText(block)}`;
    default:
      return `the spoke oracle's getReservePrice(${symbol}) ${blockText(block)}`;
  }
}

/** A peak valued at its reserve's last event's price. */
export const aaveV4PeakPriceNote = (priceBlock: number, peakBlock: number): string =>
  `price at block ${priceBlock.toLocaleString("en-US")}, this reserve's last event; the peak is at block ${peakBlock.toLocaleString("en-US")}`;

/** What a peak's receipt is, by side. */
export const AAVE_V4_PEAK_WHAT = { supply: "The peak collateral", debt: "The peak debt" } as const;

/** The names a figure is missing a price for: a symbol, or the address where
 *  the symbol is unresolved. */
export const aaveV4AssetName = (symbol: string | null | undefined, address: string | null | undefined): string =>
  symbol && !/^0x[0-9a-f]{4}…/i.test(symbol) ? symbol : (address ?? symbol ?? "an asset");

const list = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

/** The line that stands where a total cannot: what has no on-chain price. */
export const aaveV4NoPriceLine = (names: string[]): string =>
  `no dollar figure: ${list(names)} ${names.length === 1 ? "has" : "have"} no on-chain price`;

/** What stands where a figure cannot, from a result with no figure. */
export const aaveV4NoFigureLine = (r: { missing: string[]; state?: "pending" | "failed" }): string =>
  r.state === "pending"
    ? "price read pending"
    : r.state === "failed"
      ? "no dollar figure: the price read did not answer"
      : aaveV4NoPriceLine(r.missing);

/** How the face shows a figure the rows rebuild to the cent. */
export const AAVE_V4_FACE_NOTE = {
  dollars: "To the cent, shown to the dollar.",
  compact: "To the cent, shown compact, with the cents on hover.",
  cents: "",
} as const;
export type AaveV4Face = keyof typeof AAVE_V4_FACE_NOTE;
