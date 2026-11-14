// One oracle price per UTC day for a Morpho Blue position's Lifetime flows
// (rails-ops TO-DO-ui-jobs.md item 687). The panel draws a day at its close,
// so each UTC day that has events is priced at the block of its last event,
// and every row that day is valued at that price. A liquidation row carries
// the price it ran on (mig 112) and keeps it; where the day's last row is one,
// the day takes that price and needs no read.
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

/** The blocks the price route answers for, by chain, with no chain read:
 *  from Morpho Blue's creation block to an upper bound on the head, worked
 *  from a block and time the repo already holds and the chain's fastest block
 *  rate, plus an hour.
 *   · Ethereum: created at 18,883,124 (lib/vaults/protects-read.ts DEPLOYS,
 *     found by bisecting eth_getCode, 9 Nov 2026); block 26,414,661 at
 *     1,794,676,619 (rails-server's positions answer, 14 Nov 2026); at most
 *     one block a 12-second slot.
 *   · Base: created at 13,977,148 (MORPHO_BASE_DEPLOY_BLOCK,
 *     lib/morpho-base/asset-catalog.ts); block 57,429,794 at 1,794,676,334
 *     (the same answer); one block every 2 seconds.
 *   · Arbitrum: created at 296,446,593 on 17 Jan 2025
 *     (MORPHO_ARBITRUM_DEPLOY_BLOCK, lib/morpho-arbitrum/asset-catalog.ts);
 *     8 blocks a second, twice the chain's rate since. */
const BLOCK_BOUNDS: Record<number, { deploy: number; block: number; ts: number; perSecond: number }> = {
  1: { deploy: 18_883_124, block: 26_414_661, ts: 1_794_676_619, perSecond: 1 / 12 },
  8453: { deploy: 13_977_148, block: 57_429_794, ts: 1_794_676_334, perSecond: 1 / 2 },
  42161: { deploy: 296_446_593, block: 296_446_593, ts: 1_737_072_000, perSecond: 8 },
};

/** The lowest and highest block the price route answers for on a chain at
 *  `now` (unix seconds); null for a chain it does not serve. */
export function morphoPriceBlockRange(chainId: number, now: number): { min: number; max: number } | null {
  const b = BLOCK_BOUNDS[chainId];
  if (!b) return null;
  return { min: b.deploy, max: Math.ceil(b.block + (Math.max(0, now - b.ts) + 3_600) * b.perSecond) };
}

/** The price route's query, checked: chain, a market id in lowercase hex
 *  without 0x, ascending blocks each once in plain decimals inside the
 *  chain's range, at most MORPHO_PRICES_PER_REQUEST, `v=1`, and nothing else,
 *  so one set of blocks has one URL. An error names the first fault. */
export function parseMorphoPricesQuery(
  params: Iterable<[string, string]>,
  now: number,
): { chain: number; market: string; blocks: number[] } | { error: string } {
  const q = new Map<string, string>();
  for (const [k, v] of params) {
    if (q.has(k)) return { error: `${k} is given twice` };
    q.set(k, v);
  }
  for (const k of q.keys())
    if (!["chain", "market", "blocks", "v"].includes(k)) return { error: `unknown parameter ${k}` };
  if (q.get("v") !== "1") return { error: "v must be 1" };
  const chain = Number(q.get("chain"));
  const range = String(chain) === q.get("chain") ? morphoPriceBlockRange(chain, now) : null;
  if (!range) return { error: "chain must be 1, 8453 or 42161" };
  const market = q.get("market") ?? "";
  if (!/^[0-9a-f]{64}$/.test(market)) return { error: "market must be a 32-byte id in lowercase hex, without 0x" };
  const raw = (q.get("blocks") ?? "").split(",");
  const blocks = raw.map(Number);
  if (raw.some((t, i) => String(blocks[i]) !== t || !Number.isSafeInteger(blocks[i])))
    return { error: "blocks must be block numbers" };
  if (blocks.length > MORPHO_PRICES_PER_REQUEST)
    return { error: `at most ${MORPHO_PRICES_PER_REQUEST} blocks a request` };
  if (blocks.some((b, i) => i > 0 && b <= blocks[i - 1])) return { error: "blocks must be ascending, each once" };
  if (blocks[0] < range.min) return { error: `blocks must be at or after Morpho Blue's creation, block ${range.min}` };
  if (blocks[blocks.length - 1] > range.max) return { error: "blocks must be past blocks" };
  return { chain, market, blocks };
}

/** What the day rule reads of a row. */
export interface MorphoPriceRow {
  ts: number;
  block: number;
  /** The price the row carries (a liquidation's), where it carries one. */
  price: number | null;
  collDelta: number;
}

/** The UTC day number of a unix time. */
export const utcDay = (ts: number): number => Math.floor(ts / DAY_S);

/** Each UTC day with rows, oldest first: the block of its last row, and the
 *  price that row carries, where it carries one. */
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

/** Every row's block mapped to its day's price: the price the day's last row
 *  carries, else the read at that row's block. A day with neither is left out,
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
