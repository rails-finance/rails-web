// Aave V4 → the date scrubber's timeline (lib/shared/flows-timeline.ts).
// ----------------------------------------------------------------------------
// One spoke position. The page reads the day rows the index serves (GET
// /api/aave-v4/flows/daily?spoke=, rails-ops reference/lifetime-flows-scrubber.md,
// which states the mapping to buckets); the server replays the events
// /timeline serves with a port of `aaveV4EventLegs` and `aaveV4FlowEvent`, held
// to these by one fixture file (scripts/verify/verify-aave-v4-flow-legs.ts).
//
// Assets are keyed by symbol: a spoke that lists one token from two hubs holds
// two reserves of it, and the scrubber values the token, so the event's
// snapshot of the spoke is summed per symbol.

import type { AaveV4SnapshotItem, BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isAaveV4Event } from "@/lib/shared/types/event-shape";
import {
  daysFromEvents,
  type FlowAssetHeld,
  type FlowBucket,
  type FlowLive,
  type FlowTimeline,
} from "@/lib/shared/flows-timeline";
import type { FlowSeries } from "@/lib/api/fetch-aave-v3-flow-series";
import type { AaveLifetimeTotals } from "@/lib/aave-v4/lifetime-totals";
import type { ReserveStats } from "@/lib/aave-v4/spoke-cards";
import {
  AAVE_V3_FLOW_BUCKETS,
  LIQUIDATIONS_NOT_COUNTED,
  flowEventsFromLegs,
  flowSeriesTimeline,
  focusEventsFromLegs,
} from "@/lib/aave-v3/flows-timeline";
import type { FocusEvent } from "@/lib/shared/flow-focus";

export type AaveV4FlowLeg =
  | "supplied"
  | "withdrawn"
  | "borrowed"
  | "repaid"
  | "liquidatedCollateral"
  | "liquidatedDebt";

export interface AaveV4EventLeg {
  symbol: string;
  leg: AaveV4FlowLeg;
  /** Token units, positive and finite. */
  amount: number;
  /** USD per token at the event's block, where the event carries it. */
  price?: number;
}

const priceOf = (p: { usd: number } | undefined): number | undefined =>
  p != null && Number.isFinite(p.usd) && p.usd > 0 ? p.usd : undefined;

/** The legs one event adds to the lifetime flows (rails-server `aaveV4EventLegs`). */
export function aaveV4EventLegs(ev: BaseActivityEvent): AaveV4EventLeg[] {
  if (!isAaveV4Event(ev)) return [];
  const c = ev.context.data;
  const out: AaveV4EventLeg[] = [];
  const add = (symbol: string | undefined, leg: AaveV4FlowLeg, amount: string | undefined, price?: number) => {
    const n = Math.abs(Number(amount));
    if (!symbol || amount == null || !Number.isFinite(n) || n === 0) return;
    out.push(price != null ? { symbol, leg, amount: n, price } : { symbol, leg, amount: n });
  };
  if (c.eventType === "liquidation") {
    add(c.collateralSymbol, "liquidatedCollateral", c.liquidatedCollateralAmount, priceOf(c.collateralPrice));
    add(c.reserveSymbol, "liquidatedDebt", c.debtToCover ?? c.amount, priceOf(c.debtPrice));
  } else if (c.eventType === "supply") add(c.reserveSymbol, "supplied", c.amount, priceOf(c.price));
  else if (c.eventType === "withdraw") add(c.reserveSymbol, "withdrawn", c.amount, priceOf(c.price));
  else if (c.eventType === "borrow") add(c.reserveSymbol, "borrowed", c.amount, priceOf(c.price));
  else if (c.eventType === "repay") add(c.reserveSymbol, "repaid", c.amount, priceOf(c.price));
  return out;
}

/** A snapshot's holdings per symbol: two reserves of one token summed. */
function holdings(items: AaveV4SnapshotItem[] | undefined): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items ?? []) {
    const n = Number(it.amount);
    if (Number.isFinite(n)) m.set(it.symbol, (m.get(it.symbol) ?? 0) + n);
  }
  return m;
}

/** One event as the scrubber reads it (rails-server `aaveV4FlowEvent`): its
 *  legs, every balance of the spoke after it (a token no longer held stated as
 *  zero), and the prices it carries. `held` is the running set of symbols per
 *  side, updated in place. */
export function aaveV4FlowEvent(
  ev: BaseActivityEvent,
  held: { collateral: Set<string>; debt: Set<string> },
): {
  legs: AaveV4EventLeg[];
  balances: { side: "collateral" | "debt"; symbol: string; amount: number }[];
  prices: { symbol: string; usd: number }[];
} {
  const legs = aaveV4EventLegs(ev);
  const c = isAaveV4Event(ev) ? ev.context.data : undefined;
  const balances: { side: "collateral" | "debt"; symbol: string; amount: number }[] = [];
  const prices = new Map<string, number>();
  for (const l of legs) if (l.price != null) prices.set(l.symbol, l.price);
  for (const [side, items] of [
    ["collateral", c?.allSupplies],
    ["debt", c?.allDebts],
  ] as const) {
    const now = holdings(items);
    for (const s of held[side]) if (!now.has(s)) balances.push({ side, symbol: s, amount: 0 });
    for (const [s, amount] of now) balances.push({ side, symbol: s, amount });
    held[side] = new Set(now.keys());
    for (const it of items ?? []) {
      const p = priceOf(it.price);
      if (p != null && !prices.has(it.symbol)) prices.set(it.symbol, p);
    }
  }
  return { legs, balances, prices: [...prices].map(([symbol, usd]) => ({ symbol, usd })) };
}

/** Whether an event belongs to the (wallet, spoke) position: the spoke's, and
 *  the owner's (the timeline also carries rows the wallet signed for another
 *  owner, and liquidations it performed). */
export function isAaveV4PositionEvent(ev: BaseActivityEvent, wallet: string, spokeName: string): boolean {
  if (!isAaveV4Event(ev)) return false;
  const c = ev.context.data;
  if ((c.spokeName ?? "Main") !== spokeName) return false;
  const w = wallet.toLowerCase();
  return c.eventType === "liquidation" ? c.liquidator?.toLowerCase() !== w : (c.owner ?? w) === w;
}

/** Held and owed now, as the ledger states them. */
export function aaveV4FlowLive(
  totals: AaveLifetimeTotals,
  reserves: ReserveStats[],
  priceOf: (symbol: string) => number | null,
): FlowLive {
  const assets: FlowAssetHeld[] = [];
  for (const r of reserves) {
    const p = priceOf(r.symbol);
    const supplied = r.currentSupplied ?? Math.max(0, r.supplied - r.withdrawn - r.liquidatedCollateral);
    const owed = r.currentBorrowed ?? Math.max(0, r.borrowed - r.repaid - r.liquidatedDebt);
    if (supplied > 0)
      assets.push({ side: "collateral", symbol: r.symbol, amount: supplied, usd: p == null ? 0 : supplied * p });
    if (owed > 0) assets.push({ side: "debt", symbol: r.symbol, amount: owed, usd: p == null ? 0 : owed * p });
  }
  return {
    collateralUsd: Math.max(0, totals.inProtocolUsd),
    debtUsd: Math.max(0, totals.outstandingUsd),
    assets,
  };
}

/** The scrubber's timeline from a page's events (the whole history), or null:
 *  the reference the route is tested against. `todayPrices` is by symbol. */
export function aaveV4FlowTimeline(
  events: BaseActivityEvent[],
  wallet: string,
  spokeName: string,
  live: FlowLive,
  todayPrices: Record<string, number> | undefined,
): FlowTimeline | null {
  const ordered = events
    .filter((e) => isAaveV4PositionEvent(e, wallet, spokeName))
    .sort((a, b) => a.timestamp - b.timestamp || a.blockNumber - b.blockNumber);
  const held = { collateral: new Set<string>(), debt: new Set<string>() };
  const seen = new Map<BaseActivityEvent, ReturnType<typeof aaveV4FlowEvent>>();
  const of = (ev: BaseActivityEvent) => {
    let f = seen.get(ev);
    if (!f) {
      f = aaveV4FlowEvent(ev, held);
      seen.set(ev, f);
    }
    return f;
  };
  const flows = flowEventsFromLegs(
    ordered,
    (ev) =>
      of(ev).legs.map((l) => ({ symbol: l.symbol, address: l.symbol, leg: l.leg, amount: l.amount, price: l.price })),
    (ev) => of(ev).balances.map((b) => ({ side: b.side, asset: b.symbol, symbol: b.symbol, amount: b.amount })),
    todayPrices,
    {
      pricesOf: (ev) => of(ev).prices.map((p) => ({ asset: p.symbol, usd: p.usd })),
      statesAll: true,
      notCounted: LIQUIDATIONS_NOT_COUNTED,
    },
  );
  if (!flows) return null;
  return {
    buckets: AAVE_V4_FLOW_BUCKETS.filter((b) => flows.used.has(b.key)),
    days: daysFromEvents(
      AAVE_V3_FLOW_BUCKETS.map((b) => b.key),
      flows.events,
    ),
    live,
    todayPrices,
    totalEvents: flows.events.length,
  };
}

/** A spoke position's events for the flow lines (lib/shared/flow-focus.ts).
 *  `todayPrices` is by symbol. */
export function aaveV4FocusEvents(
  events: BaseActivityEvent[],
  wallet: string,
  spokeName: string,
  todayPrices: Record<string, number> | undefined,
): FocusEvent[] {
  const ordered = events
    .filter((e) => isAaveV4PositionEvent(e, wallet, spokeName))
    .sort((a, b) => a.timestamp - b.timestamp || a.blockNumber - b.blockNumber);
  return focusEventsFromLegs(
    ordered,
    (ev) =>
      aaveV4EventLegs(ev).map((l) => ({
        symbol: l.symbol,
        address: l.symbol,
        leg: l.leg,
        amount: l.amount,
        price: l.price,
      })),
    todayPrices,
  );
}

/** Aave V3's buckets under the V4 timeline's event names (its liquidation
 *  row reads "Liquidation"). */
const AAVE_V4_FLOW_BUCKETS: FlowBucket[] = AAVE_V3_FLOW_BUCKETS.map((b) =>
  b.event === "Liquidated" ? { ...b, event: "Liquidation" } : b,
);

/** The scrubber's timeline from the index's day rows. */
export function aaveV4FlowSeriesTimeline(
  series: FlowSeries,
  live: FlowLive | null,
  todayPrices: Record<string, number> | undefined,
): FlowTimeline | null {
  return flowSeriesTimeline(series, AAVE_V4_FLOW_BUCKETS, live, todayPrices);
}
