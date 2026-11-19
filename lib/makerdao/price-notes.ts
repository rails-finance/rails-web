// MakerDAO's price wording for its dollar receipts (ui-jobs 743): which read
// each price is, at which block, and the $1 par the debt is counted at. Pure
// strings, so the card, the sheet, the flows and the tests say one thing.

import { priceText } from "@/lib/shared/shown-usd";

/** The OSM price as the Spotter stores it: Spotter.poke writes spot = price ÷
 *  par ÷ mat, so the three multiplied give the price back. */
export const MAKER_PRICE_FORMULA = "Vat.ilks(ilk).spot × Spotter.par × Spotter.ilks(ilk).mat ÷ RAY³";

/** Where a read states no block for its price (the listing's ilk state). */
export const MAKER_NO_BLOCK = "a block this read does not name";

const blockText = (block: number | null | undefined): string =>
  block != null ? `block ${block.toLocaleString("en-US")}` : MAKER_NO_BLOCK;

/** The OSM price at a block; a capped feed (LockStake) names the cap and the
 *  oracle's price behind it. */
export function makerPriceNote(
  block: number | null | undefined,
  cap?: { capUsd: number; oracleUsd: number | null } | null,
): string {
  const base = `${MAKER_PRICE_FORMULA} at ${blockText(block)}`;
  if (!cap) return base;
  return cap.oracleUsd != null
    ? `${base}, capped by governance at ${priceText(cap.capUsd)}; oracle ${priceText(cap.oracleUsd)}`
    : `${base}, capped by governance at ${priceText(cap.capUsd)}`;
}

/** The debt token at the Vat's par. */
export const makerParNote = (symbol: string): string => `$1, the Vat's par: one ${symbol} counts as one dollar`;

const dayText = (day: number): string =>
  new Date(day * 86_400_000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

/** Where a Lifetime flows row's collateral price came from, with both blocks
 *  named where they differ. */
export type MakerRowPrice = (
  | { from: "row"; block: number }
  | { from: "store" | "store-near"; day: number; dayBlock: number | null; eventBlock: number; staleDays?: number }
  | { from: "today"; block: number | null }
  | { from: "nearest"; block: number | null; eventBlock: number; staleDays?: number }
) & {
  /** A capped feed (LockStake): the price is the lower of governance's cap
   *  and the oracle's, and the store keeps no oracle price beside it. */
  capped?: boolean;
};

export function makerRowPriceNote(p: MakerRowPrice): string {
  const note = rowNote(p);
  return p.capped ? `${note}. It is Maker's capped price, the lower of governance's cap and the oracle's` : note;
}

function rowNote(p: MakerRowPrice): string {
  const old = (d?: number) => (d != null && d > 30 ? `, more than 30 days old (${d} days)` : "");
  switch (p.from) {
    case "row":
      return `the OSM price at this liquidation's block, ${blockText(p.block)}`;
    case "store":
      return `price at the close of ${dayText(p.day)}, ${p.dayBlock != null ? blockText(p.dayBlock) : "a block the daily store's route does not state"}; this event is at block ${p.eventBlock.toLocaleString("en-US")}`;
    case "store-near":
      return `the nearest day's price, at the close of ${dayText(p.day)}, ${p.dayBlock != null ? blockText(p.dayBlock) : "a block the daily store's route does not state"}${old(p.staleDays)}; this event is at block ${p.eventBlock.toLocaleString("en-US")}`;
    case "today":
      return p.block != null
        ? `the latest block's price, block ${p.block.toLocaleString("en-US")}`
        : "the live read's price, which names no block";
    case "nearest":
      return `the nearest priced moment, ${blockText(p.block)}${old(p.staleDays)}; this event is at block ${p.eventBlock.toLocaleString("en-US")}`;
  }
}
