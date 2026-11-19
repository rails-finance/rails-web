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

/** Where a stretch's stability-fee rate comes from (lib/makerdao/flows.ts
 *  `makerFeeRateFrom`), continuous a year: `block` is the row it grows from. */
export type MakerRateFrom =
  | { from: "rows"; rate: number; block: number; toBlock: number }
  | { from: "live"; rate: number; block: number; liveBlock: number | null }
  | { from: "fee"; rate: number; block: number }
  | { from: "carried"; rate: number; block: number }
  | { from: "none"; rate: number; block: number };

/** The debt's interest factor's note, by the branch that gave its rate; none
 *  where there is no rate. */
export function makerFactorNote(r: MakerRateFrom): string | null {
  const b = (n: number) => n.toLocaleString("en-US");
  switch (r.from) {
    case "rows":
      return `compounded each second at the rate the Vat's accumulators at blocks ${b(r.block)} and ${b(r.toBlock)} imply`;
    case "live":
      return r.liveBlock != null
        ? `compounded each second at the rate the Vat's accumulator at block ${b(r.block)} and the live read's at block ${b(r.liveBlock)} imply`
        : `compounded each second at the rate the Vat's accumulator at block ${b(r.block)} and the live read's, which names no block, imply`;
    case "fee":
      return `compounded each second at the live read's stability fee, ln(1 + fee) a year, from block ${b(r.block)}; no accumulator after that row is read`;
    case "carried":
      return `compounded each second at the rate of the stretch before block ${b(r.block)}, carried on: the row at this block moves no time`;
    case "none":
      return null;
  }
}

/** Where a Lifetime flows row's collateral price came from, with both blocks
 *  named where they differ. */
export type MakerRowPrice = (
  | { from: "row"; block: number }
  | { from: "store" | "store-near"; day: number; dayBlock: number | null; eventBlock: number; staleDays?: number }
  | { from: "today"; block: number | null; eventBlock?: number }
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
    case "today": {
      const ev = p.eventBlock != null ? `; this event is at block ${p.eventBlock.toLocaleString("en-US")}` : "";
      return p.block != null
        ? `the latest read's price, block ${p.block.toLocaleString("en-US")}${ev}`
        : `the live read's price, which names no block${ev}`;
    }
    case "nearest":
      return `the nearest priced moment, ${blockText(p.block)}${old(p.staleDays)}; this event is at block ${p.eventBlock.toLocaleString("en-US")}`;
  }
}
