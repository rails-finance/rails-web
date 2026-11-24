// Every oracle line's price now for one token on one chain (ui-jobs 818): the
// answer an asset page reads for its headline price, its table's Price now and
// Gap, and its as-of line. The real answer is the server's same-block read
// (GET /api/prices/assets/now?chain=&token=): every line read in one call at
// one block, `sameBlock` true. Until it is served, the page's client
// (lib/api/fetch-asset-prices-now.ts) answers from the stored rounds and
// daily store instead (`storedPricesNow`): each line's latest stored value at
// its block, `sameBlock` false, and the page then draws each price with
// its stamp and no gap.
//
// Pure, and imports types only, so scripts/test can load it.

import type { PageLine } from "./asset-roster";

/** One line's price in the answer. */
export interface LinePriceNow {
  /** A price was read. */
  ok: boolean;
  /** The price in USD; null where none was read. */
  price: number | null;
  /** Read, but the oracle's last update is older than its heartbeat at the block. */
  stale?: boolean;
  /** Why no price was read ("The feed reverted"), where `ok` is false. */
  reason?: string;
  /** The block and its time the price stands at: the answer's on a
   *  same-block read, the stored value's on the stub. */
  block: number | null;
  timestamp: number | null;
  /** What the price is, for its receipt: a call at the block ("latestRoundData()"),
   *  or on the stub the stored value ("round", "day"). */
  read: string;
}

export interface AssetPricesNow {
  chain: number;
  /** The block every price was read at, with its time; on the stub the latest
   *  of the lines' blocks. */
  block: number | null;
  timestamp: number | null;
  /** Every line read at `block`. False on the stub: each line has its block. */
  sameBlock: boolean;
  /** The answer is the stub's, from stored values. */
  stub?: true;
  /** By line id (`<chain>:<oracle>`). */
  prices: Record<string, LinePriceNow>;
}

/** The stored rounds as /api/prices/rounds answers them, the parts the stub reads. */
export interface StoredRounds {
  lane: "on" | "off";
  asOf?: { block: number; ts: number | null };
  lines: Record<string, StoredRoundsLine | { unsettled: string }>;
}
interface StoredRoundsLine {
  unit?: string;
  scale: number;
  /** [ts, value at `scale`, block in force from, …]. */
  points: [number, string, number, ...unknown[]][];
}
/** The daily store as /api/prices/daily answers it, the parts the stub reads. */
export interface StoredDaily {
  series?: Record<string, { unit?: string; scale?: number; obs?: [number, string, string, string?, number?][] }>;
}

const DAY_S = 86_400;
/** The days back the stub reads the daily store. */
export const RECENT_DAYS = 10;
const NO_STORE = "Rails stores no price for this oracle";
const NOT_RECENT = `Rails stores no price for this oracle in the last ${RECENT_DAYS} days`;
const NOT_READ = "The stored prices were not read";

/** A line's latest stored value: its last stored round (in force at the
 *  rounds' checkpoint), else the last day the daily store holds for its drawn series. */
function storedLine(line: PageLine, rounds: StoredRounds | null, daily: StoredDaily | null): LinePriceNow {
  const wire = rounds?.lane === "on" ? rounds.lines[line.oracle.address.toLowerCase()] : undefined;
  if (wire && "points" in wire && (wire.unit ?? "usd") === "usd" && wire.points.length) {
    const last = wire.points[wire.points.length - 1];
    const price = Number(last[1]) / 10 ** wire.scale;
    if (Number.isFinite(price) && price > 0) {
      // The checkpoint where the answer names its time, else the round's
      // block and time: a block always with its time.
      const at =
        rounds?.asOf?.ts != null ? { block: rounds.asOf.block, ts: rounds.asOf.ts } : { block: last[2], ts: last[0] };
      return { ok: true, price, block: at.block, timestamp: at.ts, read: "round" };
    }
  }
  const s = line.drawn ? daily?.series?.[line.drawn.key] : undefined;
  if (!line.drawn) return { ok: false, price: null, reason: NO_STORE, block: null, timestamp: null, read: "day" };
  if (!daily) return { ok: false, price: null, reason: NOT_READ, block: null, timestamp: null, read: "day" };
  let best: { day: number; price: number; block: number } | null = null;
  for (const [day, raw, block, unit, scale] of s?.obs ?? []) {
    const sc = scale ?? s?.scale;
    const price = sc != null ? Number(raw) / 10 ** sc : NaN;
    if ((unit ?? s?.unit) !== "usd" || !Number.isFinite(price) || price <= 0) continue;
    if (!best || day > best.day) best = { day, price, block: Number(block) };
  }
  if (!best) return { ok: false, price: null, reason: NOT_RECENT, block: null, timestamp: null, read: "day" };
  // A day's read stands at the day's close.
  return { ok: true, price: best.price, block: best.block, timestamp: (best.day + 1) * DAY_S - 1, read: "day" };
}

/** The stub's answer: each line's latest stored value at its block. A
 *  failed read of either store leaves the lines it would price unread. */
export function storedPricesNow(
  chain: number,
  lines: readonly PageLine[],
  rounds: StoredRounds | null,
  daily: StoredDaily | null,
): AssetPricesNow {
  const prices: Record<string, LinePriceNow> = {};
  let block: number | null = null;
  let timestamp: number | null = null;
  for (const l of lines) {
    const p = storedLine(l, rounds, daily);
    prices[l.id] = p;
    if (p.ok && p.block != null && (block == null || p.block > block)) {
      block = p.block;
      timestamp = p.timestamp;
    }
  }
  return { chain, block, timestamp, sameBlock: false, stub: true, prices };
}

/** The answer where the whole read failed (the route's 502): every line unread. */
export function unreadPricesNow(chain: number, lines: readonly PageLine[], reason: string): AssetPricesNow {
  const prices: Record<string, LinePriceNow> = {};
  for (const l of lines) prices[l.id] = { ok: false, price: null, reason, block: null, timestamp: null, read: "" };
  return { chain, block: null, timestamp: null, sameBlock: false, prices };
}
