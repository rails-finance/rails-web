// A Liquity V2 redeemer's Lifetime flows: BOLD's market price over the days
// the wallet redeemed, its redemption days on the events row, tied to the
// timeline by the day (`FlowTimeline.chartAlone`: a wallet holds no position,
// so no bars, value line or totals). The price is the Curve BOLD/USDC pool's
// last_price(0) at the end of the newest stored Liquity V2 event block of
// each UTC day (rails-server GET /api/liquity-v2/bold-prices/daily, mig 497);
// the days are every day the wallet redeemed on, whatever page the list is
// on (GET /api/liquity-v2/redeemer/:address/days). The axis runs from the
// first redemption day to the last.
//
// Imports types only, so the unit tests load it as it stands.

import type { FocusEvent } from "@/lib/shared/flow-focus";
import type { FlowBucket, FlowDayRow, FlowTimeline } from "@/lib/shared/flows-timeline";
import type { DayObs, PriceSeries } from "@/lib/shared/price-series";
import type { LiquityV2RedemptionRow } from "@/lib/sources/api/liquity-v2-redeemer";

const DAY_S = 86_400;
const A = "bold";
const BOLD = "BOLD";
const BOLD_ADDRESS = "0x6440f144b7e50d6a8439336510312d2f54beb01d";
const BUCKET = "redeemed";

/** The wallet's redemption days: [day, operations, transactions, bold_raw]. */
export type RedeemerDay = [number, number, number, string];

export interface RedeemerDaysResponse {
  address: string;
  days: RedeemerDay[];
}

export interface BoldDailyResponse {
  source: string;
  pool: string;
  quoteSymbol: string;
  from: number;
  to: number;
  /** The lane's oldest stored block and its day: days before it are not read yet. */
  filledFrom: { block: number; day: number | null } | null;
  obs: [number, number, number][];
}

/** BOLD from a 1e18 raw, as a number. */
const boldOf = (raw: string) => Number(BigInt(raw) / BigInt(1e12)) / 1e6;

/** The bars' grain (lib/shared/flows-timeline.ts `unitScaleFor`). */
function scaleFor(peak: number): number {
  if (!(peak > 0)) return 2;
  return Math.max(0, Math.min(8, 4 - Math.floor(Math.log10(peak))));
}

/** The source's words, for the price tip's receipt and the caption. */
export const BOLD_PRICE_SOURCE =
  "1 ÷ the Curve BOLD/USDC pool's last_price(0) at the end of each day's newest stored block";

/** The price tip's receipt: the day's point at its block. */
const BOLD_HERE = {
  read: "BOLD's market price in USD on {day}: 1 ÷ the Curve BOLD/USDC pool's last_price(0) at the end of block {block}, the newest Liquity V2 event block stored that day, with USDC at $1.",
  live: "BOLD's market price in USD on {day}: 1 ÷ the Curve BOLD/USDC pool's last_price(0), with USDC at $1.",
};

/** The words the readout states on a day the store has not read yet. */
export const BOLD_UNREAD_TEXT = "Not read yet";

/** The price days drawn: the answer's points inside the span, and the days
 *  before the store's first one marked as not read yet. */
export function boldPriceSeries(prices: BoldDailyResponse, firstDay: number, lastDay: number): PriceSeries | null {
  const unread = unfilledThrough(prices, firstDay, lastDay);
  const points = prices.obs
    .filter(([d, usd]) => d >= firstDay && d <= lastDay && Number.isFinite(usd) && usd > 0)
    .map(([d, usd, block]) => [d, usd, block] as [number, number, number]);
  if (points.length === 0) return null;
  return {
    key: `bold:${prices.source}`,
    asset: { symbol: BOLD, address: BOLD_ADDRESS, chain: 1 },
    unit: "usd",
    grain: "daily",
    source: BOLD_PRICE_SOURCE,
    points,
    here: BOLD_HERE,
    ...(unread != null ? { unread: { through: unread, text: BOLD_UNREAD_TEXT } } : {}),
  };
}

/** The last day of the span [firstDay, lastDay] the price store has not read
 *  yet, or null where it has read the whole span or the price read failed
 *  (`prices` null). The store reads newest first from `filledFrom`: a store
 *  with no row, or a first row whose day is not mapped yet, has read none of
 *  the span. */
export function unfilledThrough(prices: BoldDailyResponse | null, firstDay: number, lastDay: number): number | null {
  if (!prices) return null;
  const from = prices.filledFrom?.day;
  if (from == null) return lastDay;
  const through = Math.min(from - 1, lastDay);
  return through >= firstDay ? through : null;
}

/** The page's chart timeline, or null with no redemption day. Built from the
 *  days and prices alone, so reading more rows leaves the chart (and its
 *  cursor) as it stands. */
export function redeemerTimeline(days: RedeemerDay[], prices: BoldDailyResponse | null): FlowTimeline | null {
  const sorted = [...days].sort((a, b) => a[0] - b[0]);
  if (sorted.length === 0) return null;
  const firstDay = sorted[0][0];
  const lastDay = sorted[sorted.length - 1][0];
  let total = 0;
  for (const d of sorted) total += boldOf(d[3]);
  const scale = scaleFor(total);
  const G = 10 ** scale;
  const buckets: FlowBucket[] = [
    { key: BUCKET, label: "BOLD redeemed", event: "Redemption", side: "collateral", dir: "out", tone: "redemption" },
  ];
  let ops = 0;
  let txs = 0;
  let cum = 0;
  const dayRows: FlowDayRow[] = sorted.map(([day, o, t, raw]) => {
    ops += o;
    txs += t;
    cum += boldOf(raw);
    return {
      day,
      events: ops,
      txs,
      tick: "redemption",
      cum: { [BUCKET]: cum * G },
      balances: [{ asset: A, symbol: BOLD, side: "collateral", amount: 0 }],
      prices: [{ asset: A, usd: G, ts: day * DAY_S }],
    };
  });
  // The line's unit factor, every day: it names no block and is not drawn.
  const unit: DayObs[] = [];
  for (let d = firstDay; d <= lastDay + 1; d++) unit.push([d, G]);
  const series = prices ? boldPriceSeries(prices, firstDay, lastDay) : null;
  const timeline: FlowTimeline = {
    unit: { symbol: BOLD, scale },
    sideUnits: { collateral: { symbol: BOLD, scale }, debt: { symbol: BOLD, scale } },
    buckets,
    days: dayRows,
    live: { collateralUsd: 0, debtUsd: 0, assets: [] },
    todayPrices: { [A]: G },
    dailyPrices: { [A]: unit },
    seriesCarry: true,
    today: lastDay + 1,
    totalEvents: ops,
    totalTxs: txs,
    labels: { collateral: "BOLD redeemed", debt: "BOLD" },
    addresses: { [BOLD]: BOLD_ADDRESS },
    chartAlone: true,
    ...(series ? { shareLine: { asset: A, series, unitLabel: "USD", name: "BOLD", digits: 4 } } : {}),
    words: { close: "Last redemption" },
  };
  return timeline;
}

/** The listed rows as the chart's focus events, each under its
 *  Trove-timeline id (the card's "View on chart"). */
export function redeemerFocus(rows: LiquityV2RedemptionRow[], timeline: FlowTimeline | null): FocusEvent[] {
  const G = 10 ** (timeline?.unit?.scale ?? 0);
  return rows.map((r) => {
    const bold = boldOf(r.bold_raw);
    return {
      id: `${r.transaction_hash}_${r.log_index}`,
      ts: Number(r.block_timestamp),
      tx: r.transaction_hash,
      legs: [{ bucket: BUCKET, usd: bold * G, amount: bold, symbol: BOLD }],
    };
  });
}
