// Lifetime flows for a Sky Savings position: the scrubber's FlowTimeline
// (lib/shared/flows-timeline.ts).
//
// ONE SIDE. A savings position has no debt, so every bucket sits on the
// collateral side and the scrubber draws one bar (rails-ops
// reference/lifetime-flows-scrubber.md: one-sided positions get a single bar,
// with interest earned dashed).
//
// THE USD AXIS IS THE PSM. USDS is valued at 1 ÷ (1 + tout) USDC at each
// block (/rates `psm`); held sUSDS on a day is its shares × chi at that day's
// end (/rates `chiDaily`) at that rate. The Explanation states the totals in
// USDS, where every figure is exact.
//
// THE PRICE VIEW IS THE SHARE PRICE (rails-ops reference/lifetime-price-chart.md,
// ruling 8; ui-jobs 328 step 5). The chart draws chi in USDS in place of the
// sUSDS price in USD: each completed day's chi from /rates `chiDaily` (the
// day's last drip grown at the Savings Rate to the day's end, with the drip's
// block), and on the page's block the card's share price. A savings position
// has no liquidation, so the view has no level.

import type { FlowBucket, FlowDayRow, FlowTimeline } from "@/lib/shared/flows-timeline";
import type { DayObs, PriceSeries } from "@/lib/shared/price-series";
import { SUSDS, USDS } from "@/lib/sky-savings/constants";
import { rayNumber, units, usdcPerUsdsAt } from "@/lib/sky-savings/math";
import type { SkyFlowDay, SkyPosition, SkyRates } from "@/lib/sky-savings/types";
import type { SkySavingsContext } from "@/lib/shared/types/event-shape";

const BUCKETS: FlowBucket[] = [
  { key: "deposited", label: "Deposited", event: "Deposit", side: "collateral", dir: "in" },
  { key: "received", label: "Received by transfer", event: "Received", side: "collateral", dir: "in", hatch: "grid" },
  { key: "withdrawn", label: "Withdrawn", event: "Withdrawal", side: "collateral", dir: "out", hatch: "reverse" },
  { key: "sent", label: "Sent to another account", event: "Sent", side: "collateral", dir: "out", hatch: "dots" },
];

/** Exact per-kind totals over the whole life, in raw USDS. */
export interface SkyLifetimeTotals {
  deposited: bigint;
  received: bigint;
  withdrawn: bigint;
  sent: bigint;
}

export function skyLifetimeTotals(days: SkyFlowDay[]): SkyLifetimeTotals {
  const t = { deposited: BigInt(0), received: BigInt(0), withdrawn: BigInt(0), sent: BigInt(0) };
  for (const d of days) {
    t.deposited += BigInt(d.deposited);
    t.received += BigInt(d.received);
    t.withdrawn += BigInt(d.withdrawn);
    t.sent += BigInt(d.sent);
  }
  return t;
}

/** The scrubber's day rows, the daily sUSDS price, and the live totals. Null
 *  where there is nothing to draw or the PSM halted USDS (no price). */
export function skyFlowTimeline(
  days: SkyFlowDay[],
  rates: Pick<SkyRates, "chiDaily" | "psm">,
  position: SkyPosition,
  asOf: { block: number; chi: string | null },
  todayDay: number,
): FlowTimeline | null {
  if (days.length === 0) return null;
  const psm = rates.psm.series;
  const usdcNow = usdcPerUsdsAt(psm, asOf.block);
  if (usdcNow == null) return null;
  const cum = { deposited: 0, received: 0, withdrawn: 0, sent: 0 };
  const rows: FlowDayRow[] = [];
  let events = 0;
  for (const d of days) {
    const p = usdcPerUsdsAt(psm, d.lastBlock) ?? usdcNow;
    cum.deposited += units(d.deposited) * p;
    cum.received += units(d.received) * p;
    cum.withdrawn += units(d.withdrawn) * p;
    cum.sent += units(d.sent) * p;
    events += d.events;
    rows.push({
      day: d.day,
      events,
      tick: "collateral",
      cum: { ...cum },
      balances: [{ asset: SUSDS.address, symbol: SUSDS.symbol, side: "collateral", amount: units(d.sharesAfter) }],
      prices: [{ asset: SUSDS.address, usd: rayNumber(d.chi) * p, ts: d.day * 86_400 }],
    });
  }
  const first = days[0].day;
  const dailyPrices: [number, number][] = rates.chiDaily
    .filter((c) => c.day >= first - 1)
    .map((c) => [c.day, rayNumber(c.chiAtDayEnd) * (usdcPerUsdsAt(psm, c.lastDripBlock) ?? usdcNow)]);
  const share = skyShareLine(rates.chiDaily, first, asOf, todayDay);
  return {
    buckets: BUCKETS,
    days: rows,
    live: {
      collateralUsd: units(position.value?.raw) * usdcNow,
      debtUsd: 0,
      collateralInterestUsd: position.earned ? units(position.earned.raw) * usdcNow : null,
    },
    dailyPrices: { [SUSDS.address]: dailyPrices },
    todayPrices: asOf.chi ? { [SUSDS.address]: rayNumber(asOf.chi) * usdcNow } : undefined,
    ...(share
      ? {
          shareLine: {
            asset: SUSDS.address,
            series: share,
            unitLabel: USDS.symbol,
            name: "sUSDS share price",
            digits: 6,
          },
        }
      : {}),
    today: todayDay,
    totalEvents: position.activity.events,
    // A savings bar in the card's words (rails-ops TO-DO-sky-savings-scoping
    // item 11). The last stop is the page's sealed block, and the dollar axis
    // is the PSM rate: Sky runs no USDS price feed.
    labels: { collateral: "Balance", debt: "Debt" },
    words: {
      held: "Still saved",
      valueLine: "the balance's value in USD",
      live: `At block ${asOf.block.toLocaleString("en-US")}`,
      rest: "Interest earned",
    },
  };
}

/** The share price the chart draws: chi in USDS per completed day from the
 *  day before the first event, each at its day's last drip block, and the
 *  card's chi at the page's block on `todayDay`. Null with no point. */
export function skyShareLine(
  chiDaily: SkyRates["chiDaily"],
  first: number,
  asOf: { block: number; chi: string | null },
  todayDay: number,
): PriceSeries | null {
  const points: DayObs[] = chiDaily
    .filter((c) => c.day >= first - 1 && c.day < todayDay)
    .map((c) => [c.day, rayNumber(c.chiAtDayEnd), c.lastDripBlock]);
  if (asOf.chi) points.push([todayDay, rayNumber(asOf.chi), asOf.block]);
  const pts = points.filter(([, v]) => v > 0).map(([d, v, b]) => [d, v, b ?? null] as [number, number, number | null]);
  if (pts.length === 0) return null;
  return {
    key: "sky-savings:chi",
    asset: { symbol: SUSDS.symbol, address: SUSDS.address, chain: 1 },
    unit: "usds",
    grain: "daily",
    source: "sUSDS chi, each day's last drip grown at the Savings Rate to the day's end",
    points: pts,
    here: {
      live: "Share price — the USDS one sUSDS redeems for at the page's block {block}, the card's chi.",
      read: "Share price — the USDS one sUSDS redeems for at the end of {day}: chi as the day's last drip (block {block}) left it, grown at the Savings Rate in force to the day's end.",
      formula: "chi × rpow(ssr, day end − rho) ÷ 10^27",
    },
    help: "on the same days: the USDS one sUSDS redeems for, called chi in the contract, at each day's end from the day's last drip and the Savings Rate, and today the card's share price. A savings position has no liquidation line.",
  };
}

/** The day rows from a page's events, for a history the page holds whole
 *  (the same rows /flows/daily serves). Null when a row is missing. */
export function skyDaysFromEvents(
  events: { blockNumber: number; timestamp: number; context?: { protocol: string; data: unknown } }[],
  total: number,
): SkyFlowDay[] | null {
  if (events.length === 0 || events.length < total) return null;
  const rows = [...events].sort((a, b) => a.blockNumber - b.blockNumber);
  const out: SkyFlowDay[] = [];
  for (const e of rows) {
    if (e.context?.protocol !== "sky-savings") return null;
    const c = e.context.data as SkySavingsContext;
    const day = Math.floor(e.timestamp / 86_400);
    let d = out[out.length - 1];
    if (!d || d.day !== day) {
      d = {
        day,
        events: 0,
        deposited: "0",
        received: "0",
        withdrawn: "0",
        sent: "0",
        sharesAfter: "0",
        chi: c.chi,
        lastBlock: 0,
      };
      out.push(d);
    }
    d.events += 1;
    const key = c.eventType === "deposit" ? "deposited" : c.eventType === "withdrawal" ? "withdrawn" : c.eventType;
    if (key === "deposited" || key === "withdrawn" || key === "received" || key === "sent")
      d[key] = (BigInt(d[key]) + BigInt(c.usds)).toString();
    d.sharesAfter = c.sharesAfter;
    d.chi = c.chi;
    d.lastBlock = e.blockNumber;
  }
  return out;
}
