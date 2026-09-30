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

import type { FlowBucket, FlowDayRow, FlowTimeline } from "@/lib/shared/flows-timeline";
import { SUSDS } from "@/lib/sky-savings/constants";
import { rayNumber, units, usdcPerUsdsAt } from "@/lib/sky-savings/math";
import type { SkyFlowDay, SkyPosition, SkyRates } from "@/lib/sky-savings/types";
import type { SkySavingsContext } from "@/lib/shared/types/event-shape";

const BUCKETS: FlowBucket[] = [
  { key: "deposited", label: "Deposited", event: "Deposit", side: "collateral", dir: "in" },
  { key: "received", label: "Received by transfer", event: "Received", side: "collateral", dir: "in" },
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
    today: todayDay,
    totalEvents: position.activity.events,
    // A savings bar in the card's words (rails-ops TO-DO-sky-savings-scoping
    // item 11). The last stop is the page's sealed block, and the dollar axis
    // is the PSM rate: Sky runs no USDS price feed.
    labels: { collateral: "Balance", debt: "Debt" },
    words: {
      held: "Still saved",
      live: `At block ${asOf.block.toLocaleString("en-US")}`,
      rest: "Interest earned",
    },
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
