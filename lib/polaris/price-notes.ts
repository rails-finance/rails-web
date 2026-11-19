// Polaris's price wording for its dollar receipts (ui-jobs 743): every price is
// the protocol's own chain read on Sepolia, named with its block; the dollars
// are test dollars, not real ones.

import { priceText } from "@/lib/shared/shown-usd";

const blockText = (block: number | null | undefined): string =>
  block != null && block > 0 ? `at block ${block.toLocaleString("en-US")}` : "at a block this read does not name";

/** pETH in dollars: one composed row, the curve × the ETH/USD medianiser,
 *  each factor as shown. */
export function polarisPethUsdNote(o: { curve: number; ethUsd: number; block: number | null | undefined }): string {
  return `${priceText(o.curve).slice(1)} ETH (the bonding curve's currentPrice(), pETH in ETH) × ${priceText(o.ethUsd)} (ETH/USD, the medianiser's previewExternalPrice()), ${blockText(o.block)}`;
}

/** Gold in dollars: the XAU/USD medianiser. */
export const polarisXauNote = (block: number | null | undefined): string =>
  `XAU/USD, the medianiser's previewExternalPrice(), ${blockText(block)}`;

/** USDp at its dollar: the market's feed prices pETH in USDp as the curve ×
 *  ETH/USD, so one USDp is a dollar by construction. */
export const POLARIS_USDP_FACE = "$1 a USDp, by construction of the market's feed";

/** The market's feed price for pETH in its debt unit. */
export const polarisFeedPriceNote = (stable: string, block: number | null | undefined): string =>
  `pETH in ${stable}, the market's PriceFeed previewPrice(), ${blockText(block)}`;

/** Every Polaris dollar is Sepolia's. */
export const POLARIS_TEST_DOLLAR = "Sepolia testnet figures: a test dollar, not a real one.";
