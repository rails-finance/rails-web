// Aave V3 → the date scrubber's timeline (lib/shared/flows-timeline.ts), and
// the pieces SparkLend (lib/spark/flows-timeline.ts) and Aave V4
// (lib/aave-v4/flows-timeline.ts) share: the buckets, the event-level
// reduction from a classifier's legs, and the mapping of a route's answer.
// ----------------------------------------------------------------------------
// The page reads the day rows the index serves (GET /api/aave-v3/flows/daily,
// rails-ops reference/lifetime-flows-scrubber.md): the whole history and a
// daily price per held asset, however the timeline itself is served.
// `aaveV3FlowSeriesTimeline` maps that answer. The server classifies each
// event with a port of `aaveV3FlowLegs`, held to it by one fixture file
// (scripts/verify/verify-aave-v3-flow-legs.ts).
//
// `aaveV3FlowTimeline` builds the same day rows from a page's events, with
// the legs `aaveV3FlowLegs` gives: the reference the route is tested against,
// valued the way the ledger values its flows (the oracle price the event
// carries, else today's). The live stop takes held and owed from the
// ledger in both, so at the live stop the scrubber states the ledger's figures.
//
// A repay made with aTokens (`repayWithATokens`, or Repay with `useATokens`)
// burns the wallet's aTokens in the debt's asset: the debt side books it as
// Repaid and the collateral side as "Used to repay". The ledger's classifiers
// (`aaveV3EventLegs`, `sparkEventLegs`) give the debt leg only;
// `withATokenRepayLeg` adds the collateral one, and the server's port gives
// both (`rowLegs`).

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isAaveV3Event } from "@/lib/shared/types/event-shape";
import type { ChainTruthTowerData, TowerLine } from "@/lib/shared/chain-truth-economics";
import {
  daysFromEvents,
  type FlowAssetHeld,
  type FlowBucket,
  type FlowDayRow,
  type FlowEvent,
  type FlowLive,
  type FlowSide,
  type FlowTimeline,
} from "@/lib/shared/flows-timeline";
import type { FlowSeries } from "@/lib/api/fetch-aave-v3-flow-series";
import type { FocusEvent } from "@/lib/shared/flow-focus";
import {
  aaveV3EventLegs,
  aaveV3LiquidationTxs,
  type AaveV3EventLeg,
  type FlowLeg,
  type ReserveFlows,
} from "./chain-truth-tower";

/** Every bucket an Aave-family position can fill, in drawing order. */
export const AAVE_V3_FLOW_BUCKETS: FlowBucket[] = [
  { key: "deposited", label: "Deposited", event: "Supply", side: "collateral", dir: "in" },
  {
    key: "received",
    label: "Received by transfer",
    event: "Transferred in",
    side: "collateral",
    dir: "in",
    hatch: "grid",
  },
  { key: "swappedIn", label: "Swapped in", event: "Collateral swap", side: "collateral", dir: "in", hatch: "checker" },
  { key: "withdrawn", label: "Withdrawn", event: "Withdraw", side: "collateral", dir: "out", hatch: "reverse" },
  {
    key: "soldToRepay",
    label: "Sold to repay",
    event: "Repay with collateral",
    side: "collateral",
    dir: "out",
    link: "repay-with-collateral",
    hatch: "horizontal",
  },
  {
    key: "usedToRepay",
    label: "Used to repay",
    event: "Repay",
    side: "collateral",
    dir: "out",
    hatch: "dashes",
  },
  {
    key: "withdrawnSwapped",
    label: "Withdrawn and swapped",
    event: "Withdraw and swap",
    side: "collateral",
    dir: "out",
    hatch: "cross",
  },
  {
    key: "swappedOut",
    label: "Swapped to another asset",
    event: "Collateral swap",
    side: "collateral",
    dir: "out",
    hatch: "vertical",
  },
  {
    key: "sent",
    label: "Sent to another account",
    event: "Transferred out",
    side: "collateral",
    dir: "out",
    hatch: "dots",
  },
  {
    key: "liquidatedCollateral",
    label: "Liquidated",
    event: "Liquidated",
    side: "collateral",
    dir: "out",
    tone: "liquidation",
    link: "liquidation",
    hatch: "forward",
  },
  { key: "borrowed", label: "Borrowed", event: "Borrow", side: "debt", dir: "in" },
  { key: "repaid", label: "Repaid", event: "Repay", side: "debt", dir: "out", hatch: "reverse" },
  {
    key: "repaidWithCollateral",
    label: "Repaid with collateral",
    event: "Repay with collateral",
    side: "debt",
    dir: "out",
    link: "repay-with-collateral",
    hatch: "horizontal",
  },
  {
    key: "repaidBySwap",
    label: "Repaid by a debt swap",
    event: "Debt swap",
    side: "debt",
    dir: "out",
    hatch: "vertical",
  },
  {
    key: "liquidatedDebt",
    label: "Liquidated",
    event: "Liquidated",
    side: "debt",
    dir: "out",
    tone: "liquidation",
    link: "liquidation",
    hatch: "forward",
  },
  {
    key: "writtenOff",
    label: "Written off",
    event: "Debt written off",
    side: "debt",
    dir: "out",
    tone: "liquidation",
    hatch: "cross",
  },
];

/** A leg of the scrubber's flows: the ledger's legs, and the collateral a
 *  repay made with aTokens used, which the ledger does not count. */
export type SeriesFlowLeg = FlowLeg | "usedToRepay";
export type FlowEventLeg = Omit<AaveV3EventLeg, "leg"> & { leg: SeriesFlowLeg | null };

const BUCKET_OF: Record<SeriesFlowLeg, string> = {
  supplied: "deposited",
  transferredIn: "received",
  swappedIn: "swappedIn",
  withdrawn: "withdrawn",
  soldToRepay: "soldToRepay",
  usedToRepay: "usedToRepay",
  withdrawnSwapped: "withdrawnSwapped",
  swappedOut: "swappedOut",
  transferredOut: "sent",
  liquidatedCollateral: "liquidatedCollateral",
  borrowed: "borrowed",
  repaid: "repaid",
  repaidBySwap: "repaidBySwap",
  liquidatedDebt: "liquidatedDebt",
  writtenOff: "writtenOff",
};

/**
 * The ledger's lifetime flows from the route's whole-history sums: each
 * bucket's token units and value per asset, and the treasury's fees. The route
 * counts every row with the family's classifier, folder members and rows
 * before a window's cut included, so a ledger reading these meets the bars on
 * any page. Undefined where the answer carries none.
 */
export function lifetimeFromSeries(series: FlowSeries): ReserveFlows[] | undefined {
  if (!series.lifetime?.length) return undefined;
  const legOf: Record<string, FlowLeg> = { repaidWithCollateral: "repaid" };
  // The ledger has no leg for the collateral a repay with aTokens used.
  for (const [leg, bucket] of Object.entries(BUCKET_OF)) if (leg !== "usedToRepay") legOf[bucket] = leg as FlowLeg;
  const out = new Map<string, ReserveFlows>();
  const get = (asset: string): ReserveFlows => {
    const symbol = series.assets[asset]?.symbol ?? asset.slice(0, 8);
    let r = out.get(symbol);
    if (!r) {
      r = {
        symbol,
        address: asset,
        supplied: 0,
        withdrawn: 0,
        borrowed: 0,
        repaid: 0,
        liquidatedCollateral: 0,
        liquidatedDebt: 0,
        writtenOff: 0,
      };
      out.set(symbol, r);
    }
    return r;
  };
  for (const [bucket, asset, amount, usd] of series.lifetime) {
    const leg = legOf[bucket];
    if (!leg || !(amount > 0)) continue;
    const r = get(asset);
    r[leg] = (r[leg] ?? 0) + amount;
    const at = (r.atEvent ??= {});
    const cur = at[leg] ?? { amount: 0, usd: 0 };
    at[leg] = { amount: cur.amount + amount, usd: cur.usd + usd };
  }
  for (const [asset, amount] of series.treasuryFees ?? []) {
    const r = get(asset);
    r.treasuryFee = (r.treasuryFee ?? 0) + amount;
  }
  return [...out.values()];
}

const bucketOf = (l: FlowEventLeg): string | null =>
  l.leg == null ? null : l.fromCollateral ? "repaidWithCollateral" : BUCKET_OF[l.leg];

const sideOf = (bucket: string): FlowSide => AAVE_V3_FLOW_BUCKETS.find((b) => b.key === bucket)?.side ?? "collateral";
const signOf = (bucket: string): number => (AAVE_V3_FLOW_BUCKETS.find((b) => b.key === bucket)?.dir === "in" ? 1 : -1);

/** The log index an event id ends in ("0xhash:12"), for ordering one block. */
const logIndex = (id: string): number => {
  const n = Number(id.slice(id.lastIndexOf(":") + 1));
  return Number.isFinite(n) ? n : 0;
};

const num = (s: string | undefined): number | null => {
  if (s == null || s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const usdOf = (lines: TowerLine[] | undefined): number => (lines ?? []).reduce((s, l) => s + (l.usd ?? 0), 0);

/**
 * The scrubber's timeline from a page's events, or null where it cannot be
 * drawn: no events, a valued ledger missing, or a leg with no price.
 *
 * `events` must be the position's whole history. `todayPrices` is the oracle
 * price by lowercase address the ledger values with (`priceByAddress`).
 */
export function aaveV3FlowTimeline(
  events: BaseActivityEvent[],
  tower: ChainTruthTowerData,
  todayPrices: Record<string, number> | undefined,
): FlowTimeline | null {
  if (!tower.valued) return null;
  const flows = aaveV3FlowEvents(events, todayPrices);
  if (!flows) return null;
  return {
    buckets: AAVE_V3_FLOW_BUCKETS.filter((b) => flows.used.has(b.key)),
    days: daysFromEvents(
      AAVE_V3_FLOW_BUCKETS.map((b) => b.key),
      flows.events,
    ),
    live: aaveV3FlowLive(tower),
    todayPrices,
    totalEvents: flows.events.length,
  };
}

/** Each event's legs in USD, the balances it states and the prices it
 *  carries, or null where a leg has no price at its block or today. */
export function aaveV3FlowEvents(
  events: BaseActivityEvent[],
  todayPrices: Record<string, number> | undefined,
): { events: FlowEvent[]; used: Set<string> } | null {
  const ordered = events
    .filter(isAaveV3Event)
    .sort((a, b) => a.timestamp - b.timestamp || a.blockNumber - b.blockNumber || logIndex(a.id) - logIndex(b.id));
  if (ordered.length === 0) return null;
  const liqTxs = aaveV3LiquidationTxs(ordered);
  return flowEventsFromLegs(
    ordered,
    (ev) => aaveV3FlowLegs(ev, liqTxs),
    (ev) => {
      const ctx = ev.context.data;
      // The balances the row states after it: a liquidation's supply figures
      // are the collateral reserve's, its debt figures the debt reserve's.
      const isLiq = ctx.eventType === "liquidation";
      const out: StatedBalance[] = [];
      const state = (side: FlowSide, asset: string | undefined, symbol: string | undefined, amount: number | null) => {
        if (asset && symbol && amount != null) out.push({ side, asset, symbol, amount });
      };
      state(
        "collateral",
        isLiq ? (ctx.collateralAsset ?? ev.flows[0]?.token) : (ctx.reserve ?? ev.flows[0]?.token),
        isLiq ? ctx.collateralSymbol : ctx.reserveSymbol,
        num(ctx.supplyAfter),
      );
      state(
        "debt",
        ctx.reserve ?? (isLiq ? ev.flows[1]?.token : ev.flows[0]?.token),
        ctx.reserveSymbol,
        num(ctx.debtAfter),
      );
      const s = ctx.swap;
      if (s) {
        state("collateral", s.receivedAsset, s.receivedSymbol, num(s.receivedSupplyAfter));
        state("debt", s.receivedAsset, s.receivedSymbol, num(s.receivedDebtAfter));
      }
      return out;
    },
    todayPrices,
  );
}

/** The collateral leg of a repay made with aTokens, added to the ledger's
 *  legs for that event: the repaid leg's asset, amount and price, on the
 *  collateral side. A repay-with-collateral swap is a swap event and keeps
 *  its own legs. */
export function withATokenRepayLeg(ev: BaseActivityEvent, legs: AaveV3EventLeg[]): FlowEventLeg[] {
  const ctx = ev.context?.data as { eventType?: string; useATokens?: boolean } | undefined;
  if (ctx?.eventType !== "repay" || ctx.useATokens !== true) return legs;
  const repaid = legs.find((l) => l.leg === "repaid" && !l.fromCollateral);
  return repaid ? [...legs, { ...repaid, leg: "usedToRepay" }] : legs;
}

/** An Aave V3 event's legs for the scrubber (rails-server `rowLegs`). */
export function aaveV3FlowLegs(ev: BaseActivityEvent, liqTxs: Set<string | undefined>): FlowEventLeg[] {
  return withATokenRepayLeg(ev, aaveV3EventLegs(ev, liqTxs));
}

/** The page's events as the flow lines read them (lib/shared/flow-focus.ts):
 *  each leg's bucket, in USD at the price its event carries, else today's,
 *  else unpriced. Ascending, as `ordered` is. */
export function focusEventsFromLegs<E extends BaseActivityEvent>(
  ordered: E[],
  legsOf: (ev: E) => FlowEventLeg[],
  todayPrices: Record<string, number> | undefined,
): FocusEvent[] {
  const priceToday = (address: string | undefined) => {
    const p = address ? (todayPrices?.[address] ?? todayPrices?.[address.toLowerCase()]) : undefined;
    return typeof p === "number" && p > 0 ? p : undefined;
  };
  return ordered.map((ev) => ({
    id: ev.id,
    ts: ev.timestamp,
    tx: ev.txHash?.toLowerCase(),
    legs: legsOf(ev).flatMap((l) => {
      const bucket = bucketOf(l);
      if (!bucket || !(l.amount > 0) || !Number.isFinite(l.amount)) return [];
      const price = l.price != null && l.price > 0 ? l.price : priceToday(l.address);
      return [{ bucket, usd: price == null ? null : l.amount * price, amount: l.amount, symbol: l.symbol }];
    }),
  }));
}

/** An Aave V3 page's events for the flow lines. */
export function aaveV3FocusEvents(
  events: BaseActivityEvent[],
  todayPrices: Record<string, number> | undefined,
): FocusEvent[] {
  const ordered = events
    .filter(isAaveV3Event)
    .sort((a, b) => a.timestamp - b.timestamp || a.blockNumber - b.blockNumber || logIndex(a.id) - logIndex(b.id));
  const liqTxs = aaveV3LiquidationTxs(ordered);
  return focusEventsFromLegs(ordered, (ev) => aaveV3FlowLegs(ev, liqTxs), todayPrices);
}

/** Actions each family's position card leaves out of its transaction count
 *  (rails-server `LegRules.notCounted`): Aave V3's listing leaves out
 *  transfers too; SparkLend's and Aave V4's leave out liquidations only. */
export const AAVE_V3_NOT_COUNTED: readonly string[] = ["liquidation", "transfer_in", "transfer_out"];
export const LIQUIDATIONS_NOT_COUNTED: readonly string[] = ["liquidation"];

/** Whether the card counts an event's transaction: its action, or for a swap
 *  any of the rows behind it (rails-server `rowCountsTx`). */
export function countsTx(ev: BaseActivityEvent, notCounted: readonly string[]): boolean {
  const out = (a: string | undefined) => a != null && notCounted.includes(a);
  const c = ev.context?.data as
    | {
        eventType?: string;
        swap?: { givenAction?: string; receivedAction?: string; events?: { action: string }[] };
      }
    | undefined;
  if (!c?.eventType) return true;
  if (c.eventType !== "swap") return !out(c.eventType);
  const s = c.swap;
  if (!s) return false;
  if (!out(s.givenAction)) return true;
  if (s.receivedAction != null && s.receivedAction !== "trade" && !out(s.receivedAction)) return true;
  return (s.events ?? []).some((e) => !out(e.action));
}

/** A balance an event states after it. */
export interface StatedBalance {
  side: FlowSide;
  asset: string;
  symbol: string;
  amount: number;
}

/**
 * The scrubber's events from a family's classifier: each leg into its bucket
 * at the price its event carries (else today's), the balances the event
 * states, and a balance it does not state following its legs. Null where a
 * leg has no price at its block or today. `ordered` is ascending.
 * `opts.pricesOf` adds prices an event carries beyond its legs';
 * `opts.statesAll` says every event states every balance, so none follows a leg;
 * `opts.notCounted` names the actions the card's transaction count leaves out.
 */
export function flowEventsFromLegs<E extends BaseActivityEvent>(
  ordered: E[],
  legsOf: (ev: E) => FlowEventLeg[],
  statedOf: (ev: E) => StatedBalance[],
  todayPrices: Record<string, number> | undefined,
  opts: {
    pricesOf?: (ev: E) => { asset: string; usd: number }[];
    statesAll?: boolean;
    notCounted?: readonly string[];
  } = {},
): { events: FlowEvent[]; used: Set<string> } | null {
  const { pricesOf, statesAll = false, notCounted = AAVE_V3_NOT_COUNTED } = opts;
  if (ordered.length === 0) return null;
  const priceToday = (address: string | undefined) => {
    const p = address ? (todayPrices?.[address] ?? todayPrices?.[address.toLowerCase()]) : undefined;
    return typeof p === "number" && p > 0 ? p : undefined;
  };
  const running = new Map<string, number>();
  const used = new Set<string>();
  const out: FlowEvent[] = [];
  for (const ev of ordered) {
    const legs = legsOf(ev);
    const flowEvent: FlowEvent = {
      id: ev.id,
      ts: ev.timestamp,
      block: ev.blockNumber,
      tick: "collateral",
      legs: [],
      balances: [],
      prices: [],
      tx: ev.txHash ?? ev.id,
      countsTx: countsTx(ev, notCounted),
    };
    const sides = new Set<FlowSide>();
    const stated = new Map<string, { symbol: string; side: FlowSide; amount: number }>();
    for (const b of statedOf(ev))
      stated.set(`${b.side}:${b.asset.toLowerCase()}`, { symbol: b.symbol, side: b.side, amount: b.amount });

    for (const l of legs) {
      const bucket = bucketOf(l);
      if (!bucket || !(l.amount > 0) || !Number.isFinite(l.amount)) continue;
      const address = l.address?.toLowerCase();
      const price = l.price != null && l.price > 0 ? l.price : priceToday(l.address);
      if (price == null) return null;
      if (l.price != null && l.price > 0 && address) flowEvent.prices.push({ asset: address, usd: l.price });
      flowEvent.legs.push({ bucket, usd: l.amount * price, symbol: l.symbol });
      used.add(bucket);
      const side = sideOf(bucket);
      sides.add(side);
      if (!address || statesAll) continue;
      // A balance the row does not state follows the legs.
      const key = `${side}:${address}`;
      if (!stated.has(key)) {
        const next = Math.max(0, (running.get(key) ?? 0) + signOf(bucket) * l.amount);
        stated.set(key, { symbol: l.symbol, side, amount: next });
      }
    }
    for (const p of pricesOf?.(ev) ?? [])
      if (!flowEvent.prices.some((x) => x.asset === p.asset.toLowerCase()))
        flowEvent.prices.push({ asset: p.asset.toLowerCase(), usd: p.usd });
    for (const [key, b] of stated) {
      running.set(key, b.amount);
      flowEvent.balances.push({
        asset: key.slice(key.indexOf(":") + 1),
        symbol: b.symbol,
        side: b.side,
        amount: b.amount,
      });
    }
    flowEvent.tick = legs.some((l) => l.leg === "liquidatedCollateral" || l.leg === "liquidatedDebt")
      ? "liquidation"
      : sides.size === 2
        ? "both"
        : sides.has("debt")
          ? "debt"
          : "collateral";
    out.push(flowEvent);
  }
  return { events: out, used };
}

/** Held and owed now, as the ledger states them. */
export function aaveV3FlowLive(tower: ChainTruthTowerData): FlowLive {
  const c = tower.collateral;
  const d = tower.debt;
  return {
    collateralUsd: Math.max(0, usdOf(c.current)),
    debtUsd: Math.max(0, usdOf(d.current) + (d.interest?.usd ?? 0)),
    assets: towerAssets(tower, false),
  };
}

/** Each asset the ledger holds and owes now: its current lines, and where a
 *  side splits off interest (`interest`), that line joined to its asset.
 *  `collateralInterest` joins the collateral side's too. */
export function towerAssets(tower: ChainTruthTowerData, collateralInterest: boolean): FlowAssetHeld[] {
  const out: FlowAssetHeld[] = [];
  const add = (side: FlowSide, lines: TowerLine[], interest: TowerLine | null | undefined) => {
    for (const l of lines) {
      const at = out.find((x) => x.side === side && x.symbol === l.symbol);
      if (at) {
        at.usd += l.usd ?? 0;
        at.amount = at.amount != null ? at.amount + l.amount : null;
      } else out.push({ side, symbol: l.symbol, amount: l.amount, usd: l.usd ?? 0 });
    }
    if (!interest) return;
    // Interest on one asset joins it; interest summed across assets is its own line.
    const at = out.find((x) => x.side === side && x.symbol === interest.symbol);
    if (at) {
      at.usd += interest.usd ?? 0;
      at.amount = at.amount != null ? at.amount + interest.amount : null;
    } else
      out.push({
        side,
        symbol: side === "debt" ? "Interest accrued" : "Interest earned",
        amount: null,
        usd: interest.usd ?? 0,
      });
  };
  add("collateral", tower.collateral.current, collateralInterest ? tower.collateral.interest : null);
  add("debt", tower.debt.current, tower.debt.interest);
  return out;
}

/**
 * The scrubber's timeline from the index's day rows, or null where there is
 * nothing to draw. `tower` supplies the live stop when the ledger is valued;
 * otherwise the route's own live figures (balances after the last event at the
 * latest recorded price) stand.
 */
export function aaveV3FlowSeriesTimeline(
  series: FlowSeries,
  tower: ChainTruthTowerData | null,
  todayPrices: Record<string, number> | undefined,
): FlowTimeline | null {
  return flowSeriesTimeline(
    series,
    AAVE_V3_FLOW_BUCKETS,
    tower?.valued === true ? aaveV3FlowLive(tower) : null,
    todayPrices,
  );
}

/** Any family's day rows as the scrubber's timeline. `live` is the ledger's
 *  live stop; null takes the route's (balances after the last event at the
 *  latest recorded price). */
export function flowSeriesTimeline(
  series: FlowSeries,
  bucketDefs: FlowBucket[],
  live: FlowLive | null,
  todayPrices: Record<string, number> | undefined,
): FlowTimeline | null {
  if (series.days.length === 0) return null;
  const symbolOf = (a: string) => series.assets[a]?.symbol ?? a.slice(0, 8);
  const days: FlowDayRow[] = series.days.map(([day, events, tick, cum, balances, prices, txs, cells]) => ({
    day,
    events,
    tick,
    cum: Object.fromEntries(series.buckets.map((k, i) => [k, cum[i] ?? 0])),
    balances: balances.map(([side, asset, amount]) => ({ side, asset, symbol: symbolOf(asset), amount })),
    prices: prices.map(([asset, usd, ts]) => ({ asset, usd, ts })),
    ...(txs != null ? { txs } : {}),
    ...(cells ? { cumAsset: cells.map(([i, symbol, usd]) => ({ bucket: series.buckets[i], symbol, usd })) } : {}),
  }));
  const used = new Set<string>(series.buckets);
  return {
    buckets: bucketDefs.filter((b) => used.has(b.key)),
    days,
    live: live ?? { collateralUsd: series.live.collateralUsd, debtUsd: series.live.debtUsd },
    todayPrices,
    dailyPrices: Object.fromEntries(Object.entries(series.prices).map(([a, p]) => [a, p.obs])),
    today: series.today,
    totalEvents: series.totalEvents,
    ...(series.totalTxs != null ? { totalTxs: series.totalTxs } : {}),
    // The day rows hold the balances each day's last event recorded, so a
    // day between events keeps them (rails-ops reference/lifetime-flows-scrubber.md).
    words: {
      moment: {
        notes: [
          "Interest since the last event is not included: each balance is the one the last event recorded, valued at the day's price.",
        ],
      },
    },
  };
}
