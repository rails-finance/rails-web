// Lifetime flows for a MakerDAO / Sky vault: the vault's rows replayed into
// the day rows the Lifetime flows panel reads (lib/shared/flows-timeline.ts;
// rails-ops reference/lifetime-flows-scrubber.md, "MakerDAO").
// ----------------------------------------------------------------------------
// Every row states the urn's collateral (ink) and normalized debt (art) after
// it, and the Vat's rate accumulator at its block (server mig 051), so the
// debt the Vat says the vault owes is art × rate at every row
// (lib/sources/api/makerdao-timeline.ts `debtFigures`). The replay splits each
// move:
//
//     debt before the row − debt after the row before = the stability fee
//                                                       since that row
//     debt after − debt before                        = the act (a draw, a
//                                                       wipe, a fork's move,
//                                                       a liquidation's clear)
//
// The fee is the dashed part of the debt bar. A give (ownership transfer) and
// a LockStake auction marker move no balance and are not flow events; the fee
// accrued by a give lands on the next row.
//
// Values. The collateral is valued at the shared daily price store's price
// for the ilk (`maker:<ILK>`, rails-ops reference/daily-prices.md: Vat spot ×
// Spotter mat, the OSM price the Dog judged against, USD per gem): each row at
// its day's close, a liquidation at the OSM price at its block (server mig
// 111). A row today takes the live read's price. Where the store has no price
// for a day, the row takes the store's last earlier price, else its first
// later one; where the store's read failed, each row takes the nearest priced
// moment in time (a liquidation's block or today's live read). The debt is
// the debt token (DAI, or USDS on a LockStake urn) at its $1 face.
//
// Between events the collateral takes the store's daily price, carrying its
// last one over days it lacks (`seriesCarry`). The debt grows in a straight
// line from what a row recorded to what the next row's rate makes of it (the
// Vat moves the rate when someone calls Jug.drip, so a day between two rows is
// stated to within how the fee was dripped between them); after the last row
// it runs to the live read, which is today's figure.
//
// Pure: tested offline in scripts/verify/verify-makerdao-flows.ts.

import type { FlowBucket, FlowDayRow, FlowEvent, FlowTimeline } from "@/lib/shared/flows-timeline";
import { daysFromEvents } from "@/lib/shared/flows-timeline";
import type { FocusEvent } from "@/lib/shared/flow-focus";
import type { BaseActivityEvent, MakerDAOEventType } from "@/lib/shared/types/event-shape";
import { isMakerDAOEvent } from "@/lib/shared/types/event-shape";

const DAY_S = 86_400;
const ONE_YEAR_S = 31_557_600;
const DUST = 1e-12;

/** Bucket keys. */
export const MK = {
  deposited: "mk-deposited",
  returned: "mk-returned",
  collMovedIn: "mk-coll-moved-in",
  withdrawn: "mk-withdrawn",
  collMovedOut: "mk-coll-moved-out",
  seized: "mk-seized",
  generated: "mk-generated",
  fee: "mk-fee",
  debtMovedIn: "mk-debt-moved-in",
  repaid: "mk-repaid",
  debtMovedOut: "mk-debt-moved-out",
  cleared: "mk-cleared",
} as const;

const COLL_KEYS = new Set<string>([
  MK.deposited,
  MK.returned,
  MK.collMovedIn,
  MK.withdrawn,
  MK.collMovedOut,
  MK.seized,
]);
const OUT_KEYS = new Set<string>([MK.withdrawn, MK.collMovedOut, MK.seized, MK.repaid, MK.debtMovedOut, MK.cleared]);

/** The buckets in drawing order: inflows as they add up, outflows in the
 *  bar's order after what is held. */
export function makerFlowBuckets(debtSymbol: string): FlowBucket[] {
  return [
    { key: MK.deposited, label: "Deposited", event: "Deposit", side: "collateral", dir: "in" },
    {
      key: MK.returned,
      label: "Returned by auction",
      event: "Deposit",
      side: "collateral",
      dir: "in",
      hatch: "checker",
    },
    {
      key: MK.collMovedIn,
      label: "Moved in from another vault",
      event: "Move from Another Vault",
      side: "collateral",
      dir: "in",
      hatch: "grid",
      link: "fork",
    },
    { key: MK.withdrawn, label: "Withdrawn", event: "Withdraw", side: "collateral", dir: "out" },
    {
      key: MK.collMovedOut,
      label: "Moved to another vault",
      event: "Move to Another Vault",
      side: "collateral",
      dir: "out",
      hatch: "dots",
      link: "fork",
    },
    {
      key: MK.seized,
      label: "Seized in liquidations",
      event: "Liquidated",
      side: "collateral",
      dir: "out",
      tone: "liquidation",
      hatch: "forward",
      link: "liquidation",
    },
    { key: MK.generated, label: "Generated", event: `Generate ${debtSymbol}`, side: "debt", dir: "in" },
    // The fee moves on most rows, so no event's name is its own.
    { key: MK.fee, label: "Stability fee", event: "", side: "debt", dir: "in", hatch: "dashes" },
    {
      key: MK.debtMovedIn,
      label: "Moved in from another vault",
      event: "Move from Another Vault",
      side: "debt",
      dir: "in",
      hatch: "grid",
      link: "fork",
    },
    { key: MK.repaid, label: "Paid back", event: `Repay ${debtSymbol}`, side: "debt", dir: "out" },
    {
      key: MK.debtMovedOut,
      label: "Moved to another vault",
      event: "Move to Another Vault",
      side: "debt",
      dir: "out",
      hatch: "dots",
      link: "fork",
    },
    {
      key: MK.cleared,
      label: "Cleared by liquidations",
      event: "Liquidated",
      side: "debt",
      dir: "out",
      tone: "liquidation",
      hatch: "forward",
      link: "liquidation",
    },
  ];
}

/** One balance-bearing row of a vault, in human units. */
export interface MakerFlowEvent {
  id: string;
  /** Unix seconds. */
  ts: number;
  block: number;
  tx?: string;
  kind: "frob" | "grab" | "fork";
  /** The row's moves: dink (collateral) and the debt it minted or burned
   *  (dart × the rate at the block). */
  dink: number;
  debtChange: number;
  /** Collateral and debt after the row (ink; art × rate). */
  inkAfter: number;
  debtAfter: number;
  /** The Vat's rate accumulator at the row's block (a multiplier, ray ÷ 1e27). */
  rate: number;
  /** The stability fee the row states since the urn's previous row. */
  stated: number | null;
  /** The OSM price at the block, where the row carries it (liquidations,
   *  mig 111). */
  price: number | null;
  /** A deposit of what an auction handed back (lib/makerdao/vault-history.tsx
   *  `makerLeftoverLinks`). */
  returned: boolean;
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const isFlowRow = (k: MakerDAOEventType) => k === "frob" || k === "grab" || k === "fork-in" || k === "fork-out";

const near = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/** The vault's balance-bearing rows as the replay reads them, oldest first;
 *  rows in one block chained by their stated balances. `returnedIds`: the
 *  frobs that deposited an auction's leftover. Null where a row that moved
 *  the debt states no debt (no rate at its block): the replay would have to
 *  invent it. */
export function makerFlowEvents(
  events: BaseActivityEvent[],
  returnedIds: ReadonlySet<string> = new Set(),
): MakerFlowEvent[] | null {
  const rows = events.filter(isMakerDAOEvent).filter((e) => isFlowRow(e.context.data.eventType));
  // Served order is chain order; a stable sort by block keeps it.
  const sorted = rows.map((e, i) => ({ e, i })).sort((a, b) => a.e.blockNumber - b.e.blockNumber || a.i - b.i);
  const out: MakerFlowEvent[] = [];
  let ink = 0;
  let art = 0;
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j < sorted.length && sorted[j].e.blockNumber === sorted[i].e.blockNumber) j++;
    const left = sorted.slice(i, j).map((x) => x.e);
    while (left.length > 0) {
      let k = left.findIndex((e) => {
        const c = e.context.data;
        const inkBefore = (num(c.inkAfter) ?? 0) - (num(c.dink) ?? 0);
        const artBefore = (num(c.artAfter) ?? 0) - (num(c.dart) ?? 0);
        return near(inkBefore, ink) && near(artBefore, art);
      });
      if (k < 0) k = 0;
      const [e] = left.splice(k, 1);
      const c = e.context.data;
      const inkAfter = num(c.inkAfter);
      const artAfter = num(c.artAfter);
      const rate = num(c.rateAtBlock);
      if (inkAfter == null || artAfter == null) return null;
      let debtAfter = num(c.debtAfter);
      let debtChange = num(c.debtChange);
      if (debtAfter == null || debtChange == null || rate == null) {
        // No rate at the block: a row with no debt either side still adds up.
        if (artAfter > 0 || (num(c.dart) ?? 0) !== 0) return null;
        debtAfter = 0;
        debtChange = 0;
      }
      out.push({
        id: e.id,
        ts: e.timestamp,
        block: e.blockNumber,
        tx: e.txHash || undefined,
        kind: c.eventType === "grab" ? "grab" : c.eventType === "frob" ? "frob" : "fork",
        dink: num(c.dink) ?? 0,
        debtChange,
        inkAfter,
        debtAfter,
        rate: rate != null ? rate / 1e27 : 0,
        stated: num(c.interestSincePrevious),
        price:
          c.eventType === "grab" && c.priceAtBlock?.usd != null && c.priceAtBlock.usd > 0 ? c.priceAtBlock.usd : null,
        returned: c.eventType === "frob" && returnedIds.has(e.id),
      });
      ink = inkAfter;
      art = artAfter;
    }
    i = j;
  }
  return out;
}

/** Where a row's collateral price came from: its block (a liquidation's OSM
 *  price), the store's price for its day, the store's nearest day, today's
 *  live read, or (the store not read) the nearest priced moment. */
export type MakerPriceFrom = "row" | "store" | "store-near" | "today" | "nearest";

/** A replayed row's legs in token units, by bucket. */
export interface MakerReplayed {
  ev: MakerFlowEvent;
  price: number;
  priceFrom: MakerPriceFrom;
  legs: { bucket: string; amount: number }[];
}

/** What the page's live read states now, where it has one. */
export interface MakerLive {
  /** The ilk's OSM price now (USD per gem). */
  price: number | null;
  ink: number;
  /** art × the Vat's rate now. */
  debt: number;
  /** The Vat's rate now (multiplier). */
  rate: number | null;
  /** The stability fee now, a fraction a year (compounded). */
  feeApr: number | null;
}

export interface MakerFlowOptions {
  collSymbol: string;
  debtSymbol: string;
  /** Unix seconds now; the page's clock. */
  now: number;
  live: MakerLive | null;
  /** The store's daily price for the ilk, `[UTC day, usd]` ascending; null
   *  where the read failed or answered nothing. */
  daily: [number, number][] | null;
}

/** The per-row replay. */
export function replayMaker(events: MakerFlowEvent[], o: MakerFlowOptions): MakerReplayed[] {
  const today = Math.floor(o.now / DAY_S);
  const livePrice = o.live?.price != null && o.live.price > 0 ? o.live.price : null;
  const daily = o.daily && o.daily.length > 0 ? o.daily : null;
  const byDay = new Map<number, number>(daily ?? []);
  // The store's last price on or before a day, else its first after.
  const storeNear = (day: number): number | null => {
    if (!daily) return null;
    let lo = 0;
    let hi = daily.length - 1;
    let hit = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (daily[mid][0] <= day) {
        hit = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return hit >= 0 ? daily[hit][1] : daily[0][1];
  };
  const priced = events.filter((e) => e.price != null);
  const nearest = (ts: number): { price: number; from: MakerPriceFrom } => {
    const cands: { dt: number; price: number; from: MakerPriceFrom }[] = priced.map((p) => ({
      dt: Math.abs(p.ts - ts),
      price: p.price as number,
      from: "nearest" as const,
    }));
    if (livePrice != null) cands.push({ dt: Math.abs(o.now - ts), price: livePrice, from: "today" });
    cands.sort((a, b) => a.dt - b.dt);
    return cands[0] ?? { price: 0, from: "nearest" };
  };
  const priceOf = (ev: MakerFlowEvent): { price: number; from: MakerPriceFrom } => {
    if (ev.price != null) return { price: ev.price, from: "row" };
    const day = Math.floor(ev.ts / DAY_S);
    if (day >= today && livePrice != null) return { price: livePrice, from: "today" };
    const own = byDay.get(day);
    if (own != null) return { price: own, from: "store" };
    const near = storeNear(day);
    if (near != null) return { price: near, from: "store-near" };
    return nearest(ev.ts);
  };
  let ink = 0;
  let debt = 0;
  const out: MakerReplayed[] = [];
  for (const ev of events) {
    const legs: { bucket: string; amount: number }[] = [];
    const add = (bucket: string, amount: number) => {
      if (amount > DUST) legs.push({ bucket, amount });
    };
    // Collateral: the row's move, from the balances so the side adds up to
    // what the row records.
    const dColl = ev.inkAfter - ink;
    if (ev.kind === "grab") {
      if (dColl < 0) add(MK.seized, -dColl);
      else add(MK.deposited, dColl);
    } else if (ev.kind === "fork") {
      if (dColl > 0) add(MK.collMovedIn, dColl);
      else add(MK.collMovedOut, -dColl);
    } else if (dColl > 0) add(ev.returned ? MK.returned : MK.deposited, dColl);
    else add(MK.withdrawn, -dColl);
    // Debt: the fee since the last row, then the act. The Vat rounds each
    // figure down to the wei, so a fee a hair below zero stays in the act.
    const before = ev.debtAfter - ev.debtChange;
    const fee = before - debt;
    const feeKept = fee > 0 ? fee : 0;
    add(MK.fee, feeKept);
    const act = ev.debtAfter - debt - feeKept;
    if (ev.kind === "grab") {
      if (act < 0) add(MK.cleared, -act);
      else add(MK.generated, act);
    } else if (ev.kind === "fork") {
      if (act > 0) add(MK.debtMovedIn, act);
      else add(MK.debtMovedOut, -act);
    } else if (act > 0) add(MK.generated, act);
    else add(MK.repaid, -act);
    const p = priceOf(ev);
    out.push({ ev, price: p.price, priceFrom: p.from, legs });
    ink = ev.inkAfter;
    debt = ev.debtAfter;
  }
  return out;
}

/** The fee's rate from each row to the next, simple, as a fraction a year:
 *  the next row's rate over this row's, spread over the time between them;
 *  after the last row, to the live read's rate now, else the fee now. */
export function makerFeeRates(replayed: MakerReplayed[], o: MakerFlowOptions): number[] {
  const out: number[] = [];
  for (let i = 0; i < replayed.length; i++) {
    const a = replayed[i].ev;
    const b = replayed[i + 1]?.ev;
    const to = b
      ? { rate: b.rate, ts: b.ts }
      : o.live?.rate != null && o.live.rate > 0
        ? { rate: o.live.rate, ts: o.now }
        : null;
    const dt = to ? to.ts - a.ts : 0;
    if (to && dt > 0 && a.rate > 0) out.push((to.rate / a.rate - 1) / (dt / ONE_YEAR_S));
    else if (!b && o.live?.feeApr != null) out.push(Math.log(1 + o.live.feeApr));
    else out.push(out[i - 1] ?? 0);
  }
  return out;
}

/** The vault's rows as the Lifetime flows panel's timeline, in USD. Null with
 *  no rows, or where no row has a collateral price at all. */
export function makerFlowTimeline(events: MakerFlowEvent[], o: MakerFlowOptions): FlowTimeline | null {
  if (events.length === 0) return null;
  const replayed = replayMaker(events, o);
  if (!replayed.some((r) => r.price > 0)) return null;
  const rates = makerFeeRates(replayed, o);
  const coll = `coll:${o.collSymbol}`;
  const debt = `debt:${o.debtSymbol}`;
  const buckets = makerFlowBuckets(o.debtSymbol);
  const flowEvents: FlowEvent[] = replayed.map((r) => {
    const moved = { coll: false, debt: false };
    for (const l of r.legs) {
      if (l.bucket === MK.fee) continue;
      if (COLL_KEYS.has(l.bucket)) moved.coll = true;
      else moved.debt = true;
    }
    return {
      id: r.ev.id,
      ts: r.ev.ts,
      block: r.ev.block,
      tick:
        r.ev.kind === "grab" ? "liquidation" : moved.coll && moved.debt ? "both" : moved.debt ? "debt" : "collateral",
      legs: r.legs.map((l) =>
        COLL_KEYS.has(l.bucket)
          ? { bucket: l.bucket, usd: l.amount * r.price, symbol: o.collSymbol }
          : { bucket: l.bucket, usd: l.amount, symbol: o.debtSymbol },
      ),
      tx: r.ev.tx,
      // The card counts the owner's transactions; a liquidation is a keeper's.
      countsTx: r.ev.kind !== "grab",
      balances: [
        { asset: coll, symbol: o.collSymbol, side: "collateral", amount: Math.max(0, r.ev.inkAfter) },
        { asset: debt, symbol: o.debtSymbol, side: "debt", amount: Math.max(0, r.ev.debtAfter) },
      ],
      prices: [...(r.price > 0 ? [{ asset: coll, usd: r.price }] : []), { asset: debt, usd: 1 }],
    };
  });
  const days: FlowDayRow[] = daysFromEvents(
    buckets.map((b) => b.key),
    flowEvents,
  );

  const today = Math.floor(o.now / DAY_S);
  const last = replayed[replayed.length - 1];
  const open = last.ev.inkAfter > DUST || last.ev.debtAfter > DUST;
  const livePrice = o.live?.price != null && o.live.price > 0 ? o.live.price : null;
  const firstDay = Math.floor(replayed[0].ev.ts / DAY_S);
  const lastDay = Math.floor(last.ev.ts / DAY_S);
  const endDay = open ? Math.max(today, lastDay + 1) : lastDay + 1;

  // The collateral: the store's daily price, each event day the price its
  // flows took (a liquidation's at its block), and today's live price.
  const collObs = new Map<number, number>();
  for (const [d, usd] of o.daily ?? []) if (d <= today && usd > 0) collObs.set(d, usd);
  for (const r of replayed) if (r.price > 0) collObs.set(Math.floor(r.ev.ts / DAY_S), r.price);
  if (livePrice != null && open) collObs.set(today, livePrice);
  // The debt's price each day: $1 plus the fee built on what the last row
  // recorded by the day's close, in a straight line to the next row's figure
  // (or the live read's).
  const debtObs: [number, number][] = [];
  let ei = 0;
  for (let d = firstDay; d <= endDay; d++) {
    const end = Math.min((d + 1) * DAY_S, o.now);
    while (ei + 1 < replayed.length && replayed[ei + 1].ev.ts <= end) ei++;
    const e = replayed[ei].ev;
    debtObs.push([d, e.ts <= end ? 1 + rates[ei] * (Math.max(0, end - e.ts) / ONE_YEAR_S) : 1]);
  }

  // Now: the live read where the page has one, else the last row with the
  // fee grown since.
  const nowColl = open ? (o.live?.ink ?? last.ev.inkAfter) : 0;
  const nowDebt = open
    ? (o.live?.debt ?? last.ev.debtAfter * (1 + rates[rates.length - 1] * ((o.now - last.ev.ts) / ONE_YEAR_S)))
    : 0;
  const priceNow = livePrice ?? last.price;

  return {
    buckets,
    days,
    live: {
      collateralUsd: nowColl * priceNow,
      debtUsd: nowDebt,
      assets: open
        ? [
            ...(nowColl > DUST
              ? [{ side: "collateral" as const, symbol: o.collSymbol, amount: nowColl, usd: nowColl * priceNow }]
              : []),
            ...(nowDebt > DUST ? [{ side: "debt" as const, symbol: o.debtSymbol, amount: nowDebt, usd: nowDebt }] : []),
          ]
        : [],
    },
    todayPrices: { [coll]: priceNow, [debt]: 1 },
    dailyPrices: {
      [coll]: [...collObs].sort((a, b) => a[0] - b[0]),
      [debt]: debtObs,
    },
    seriesCarry: true,
    today: open ? today : endDay,
    words: makerFlowWords(o.collSymbol, o.debtSymbol, o.daily != null && o.daily.length > 0),
  };
}

/** The panel's words for a vault; `daily`: the store answered. */
export function makerFlowWords(
  collSymbol: string,
  debtSymbol: string,
  daily: boolean,
): NonNullable<FlowTimeline["words"]> {
  return {
    held: "Still deposited",
    restBySide: { collateral: "Market move", debt: "Stability fee since the last event" },
    restNote: {
      collateral: `the change in ${collSymbol}'s price since each flow`,
      debt: "the stability fee built up on the debt since the vault's last event",
    },
    basis: {
      collateral: daily
        ? "Each flow is valued at Maker's oracle price at the close of its day, a liquidation at the price at its block."
        : "Each flow is valued at the nearest recorded Maker oracle price: a liquidation's block, or today's.",
      debt: `Debt is counted at ${debtSymbol}'s $1 face.`,
    },
    heldBasis: {
      collateral: daily
        ? `the ${collSymbol} the vault held after its last event by then, at Maker's oracle price at the close of that day.`
        : `the ${collSymbol} the vault held after its last event by then, at the price of its latest event.`,
      debt: `the ${debtSymbol} the vault's last event recorded by then, plus the stability fee built on it to the end of that day.`,
    },
    linePrices: daily
      ? `with the collateral at Maker's oracle price at each day's close and the debt at $1 plus the stability fee built since`
      : `with the collateral at the price of the vault's latest event by then and the debt at $1 plus the stability fee built since`,
    moment: {
      face: ["debt"],
      noPrice: {
        collateral: `No Maker oracle price is recorded for this day, so the collateral is stated in ${collSymbol} only.`,
      },
      notes: [],
    },
  };
}

/** The rows as the event cards' sums read them (lib/shared/flow-focus.ts):
 *  each row's legs in USD at its price, the same legs the day rows add up.
 *  Each side's USD just before and once the row's transaction had run is the
 *  transaction's last row's balance at that row's price, less the
 *  transaction's acts (the fee stays in the before: it had built up by the
 *  block). */
export function makerFocusEvents(
  replayed: MakerReplayed[],
  rates: number[],
  collSymbol: string,
  debtSymbol: string,
): FocusEvent[] {
  const byTx = new Map<string, MakerReplayed[]>();
  for (const r of replayed) {
    const k = r.ev.tx ?? r.ev.id;
    const list = byTx.get(k);
    if (list) list.push(r);
    else byTx.set(k, [r]);
  }
  return replayed.map((r, i) => {
    const tx = byTx.get(r.ev.tx ?? r.ev.id) ?? [r];
    const lastOf = tx[tx.length - 1];
    let collMove = 0;
    let debtMove = 0;
    for (const t of tx)
      for (const l of t.legs) {
        if (l.bucket === MK.fee) continue;
        const sign = OUT_KEYS.has(l.bucket) ? -1 : 1;
        if (COLL_KEYS.has(l.bucket)) collMove += sign * l.amount;
        else debtMove += sign * l.amount;
      }
    const collAfter = Math.max(0, lastOf.ev.inkAfter);
    const debtAfter = Math.max(0, lastOf.ev.debtAfter);
    return {
      id: r.ev.id,
      ts: r.ev.ts,
      ...(r.ev.tx ? { tx: r.ev.tx } : {}),
      legs: r.legs.map((l) =>
        COLL_KEYS.has(l.bucket)
          ? { bucket: l.bucket, usd: l.amount * r.price, amount: l.amount, symbol: collSymbol }
          : {
              bucket: l.bucket,
              usd: l.amount,
              amount: l.amount,
              symbol: debtSymbol,
              ...(l.bucket === MK.fee ? { accrual: true } : {}),
            },
      ),
      sides: {
        collateral: {
          before: Math.max(0, collAfter - collMove) * lastOf.price,
          after: collAfter * lastOf.price,
          amount: collMove,
          symbol: collSymbol,
          held: collAfter,
        },
        debt: {
          before: Math.max(0, debtAfter - debtMove),
          after: debtAfter,
          amount: debtMove,
          symbol: debtSymbol,
          held: debtAfter,
        },
      },
      rate: (rates[i] ?? 0) * 100,
    };
  });
}

/** How the rows' collateral was priced, counted over the rows that moved it. */
export function makerPricing(replayed: MakerReplayed[]): Record<MakerPriceFrom, number> {
  const out: Record<MakerPriceFrom, number> = { row: 0, store: 0, "store-near": 0, today: 0, nearest: 0 };
  for (const r of replayed) if (r.legs.some((l) => COLL_KEYS.has(l.bucket))) out[r.priceFrom]++;
  return out;
}

/** Whether a vault ever owed. */
export function makerBorrower(events: MakerFlowEvent[]): boolean {
  return events.some((e) => e.debtAfter > DUST || e.debtChange !== 0);
}
