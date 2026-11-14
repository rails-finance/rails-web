// One oracle price per UTC day for a Morpho Blue position's Lifetime flows
// (rails-ops TO-DO-ui-jobs.md item 687). The panel draws a day at its close,
// so each UTC day that has events is priced at the block of its last event,
// the closest event block to the day's close, and every row that day is
// valued at that price. A row that carries its own price (a liquidation, mig
// 112) keeps it; where the day's last row carries one, the day takes it and
// needs no read.
//
// Pure, with no imports: the page's hook, the price route and
// scripts/test/morpho-price-days.test.mjs share it.

const DAY_S = 86_400;
const DUST = 1e-12;

/** At most this many days' oracle reads per page; the rest take the nearest
 *  priced day's price, and the Explanation counts them. */
export const MORPHO_PRICE_DAYS = 250;
/** At most this many blocks per /api/chain/morpho/prices request. */
export const MORPHO_PRICES_PER_REQUEST = 50;

/** What the day rule reads of a row. */
export interface MorphoPriceRow {
  ts: number;
  block: number;
  /** The row's own price (a liquidation's), where it carries one. */
  price: number | null;
  collDelta: number;
}

/** The UTC day number of a unix time. */
export const utcDay = (ts: number): number => Math.floor(ts / DAY_S);

/** Each UTC day with rows, oldest first: the block of its last row, and that
 *  row's own price where it carries one. */
export function morphoPriceDays(
  rows: readonly MorphoPriceRow[],
): { day: number; block: number; stored: number | null; collFlow: boolean }[] {
  const byDay = new Map<number, { day: number; block: number; ts: number; stored: number | null; collFlow: boolean }>();
  for (const r of rows) {
    const day = utcDay(r.ts);
    const cur = byDay.get(day);
    const later = !cur || r.block > cur.block || (r.block === cur.block && r.ts >= cur.ts);
    const stored = r.price != null && r.price > 0 ? r.price : null;
    const collFlow = Math.abs(r.collDelta) > DUST || (cur?.collFlow ?? false);
    if (later) byDay.set(day, { day, block: r.block, ts: r.ts, stored, collFlow });
    else if (cur) cur.collFlow = collFlow;
  }
  return [...byDay.values()]
    .sort((a, b) => a.day - b.day)
    .map(({ day, block, stored, collFlow }) => ({ day, block, stored, collFlow }));
}

/** The blocks to read, ascending: each day's last-row block where that row
 *  carries no price, at most `cap` days. Over the cap, days with a collateral
 *  flow come first, newest first, then the rest, newest first. */
export function morphoPriceDayBlocks(rows: readonly MorphoPriceRow[], cap = MORPHO_PRICE_DAYS): number[] {
  const need = morphoPriceDays(rows).filter((d) => d.stored == null);
  const pick = [...need.filter((d) => d.collFlow).reverse(), ...need.filter((d) => !d.collFlow).reverse()];
  return [...new Set(pick.slice(0, Math.max(0, cap)).map((d) => d.block))].sort((a, b) => a - b);
}

/** Ascending blocks in requests of at most `size`, oldest first, so a new
 *  day changes only the last request and the earlier ones stay cached. */
export function morphoPriceChunks(blocks: readonly number[], size = MORPHO_PRICES_PER_REQUEST): number[][] {
  const sorted = [...new Set(blocks)].sort((a, b) => a - b);
  const out: number[][] = [];
  for (let i = 0; i < sorted.length; i += size) out.push(sorted.slice(i, i + size));
  return out;
}

/** Every row's block mapped to its day's price: the day's last row's own
 *  price, else the read at that row's block. A day with neither is left out,
 *  and its rows take the nearest priced row's price in the replay. */
export function morphoDayPriceMap(
  rows: readonly MorphoPriceRow[],
  reads: ReadonlyMap<number, number>,
): Map<number, number> {
  const dayPrice = new Map<number, number>();
  for (const d of morphoPriceDays(rows)) {
    const p = d.stored ?? reads.get(d.block) ?? null;
    if (p != null && p > 0) dayPrice.set(d.day, p);
  }
  const out = new Map<number, number>();
  for (const r of rows) {
    const p = dayPrice.get(utcDay(r.ts));
    if (p != null) out.set(r.block, p);
  }
  return out;
}
