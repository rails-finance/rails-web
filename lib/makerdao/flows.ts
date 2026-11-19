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

import type { FlowBucket, FlowDayRow, FlowEvent, FlowLeg, FlowTimeline } from "@/lib/shared/flows-timeline";
import { daysFromEvents, flowLeg, livePriced } from "@/lib/shared/flows-timeline";
import type { FocusEvent } from "@/lib/shared/flow-focus";
import type { BaseActivityEvent, MakerDAOEventType } from "@/lib/shared/types/event-shape";
import { isMakerDAOEvent } from "@/lib/shared/types/event-shape";
import { actedByOther } from "@/lib/shared/external-actor";
import { makerTxHashOf } from "@/lib/makerdao/market-notes";
import { shownUsd } from "@/lib/shared/shown-usd";
import type { DayObs } from "@/lib/shared/price-series";
import {
  makerFactorNote,
  makerParNote,
  makerRowPriceNote,
  type MakerRateFrom,
  type MakerRowPrice,
} from "@/lib/makerdao/price-notes";

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
  /** Another account acted: the card's `externalActor` verdict against the
   *  owner in force, less a vault a contract opened and gave the signer in the
   *  same transaction (`openedForSigner`). */
  byOther?: boolean;
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
  // Each transaction's gives, for `openedForSigner`'s rule.
  const gives = new Map<string, { dstOwner?: string | null; dst?: string | null }[]>();
  for (const e of events.filter(isMakerDAOEvent)) {
    const g = e.context.data;
    if (g.eventType !== "give") continue;
    const tx = makerTxHashOf(e);
    gives.set(tx, [...(gives.get(tx) ?? []), { dstOwner: g.giveDstOwner, dst: g.giveDst }]);
  }
  const byOther = (e: (typeof rows)[number]): boolean => {
    const c = e.context.data;
    if (c.eventType === "grab") return false;
    const opened = (gives.get(makerTxHashOf(e)) ?? []).some(
      (g) => (g.dstOwner != null && g.dstOwner === c.txFrom) || (g.dst != null && g.dst === c.txTo),
    );
    return !opened && actedByOther({ txFrom: c.txFrom, poolCaller: c.txTo }, c.ownerAt ?? e.wallet);
  };
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
        byOther: byOther(e),
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
  /** The price's read and blocks, for the receipts (lib/makerdao/price-notes.ts). */
  priceAt: MakerRowPrice;
  legs: { bucket: string; amount: number }[];
}

/** The basis a leg at the latest read's price stands on (a past event priced
 *  live), and the family's (ui-jobs 743). */
const MAKER_TODAY_BASIS = "the latest read's price";
const MAKER_BLOCK_BASIS = "each block's price";

/** A row priced at the live read, from a later block than its own: a
 *  latest read, both blocks named, not complete and on another basis
 *  (ui-jobs 743). */
const atLatestRead = (r: MakerReplayed): boolean =>
  r.priceFrom === "today" && makerPriceBlock(r.priceAt) !== r.ev.block;

/** The block a row's price stands at, where its read names one. */
function makerPriceBlock(p: MakerRowPrice): number | null {
  switch (p.from) {
    case "row":
      return p.block;
    case "store":
    case "store-near":
      return p.dayBlock;
    case "today":
    case "nearest":
      return p.block;
  }
}

/** A vault row's leg with its parts (ui-jobs 743): the collateral at the
 *  row's price as shown, named by makerRowPriceNote with its blocks; a past
 *  event at the latest read's price on another basis; the debt at its $1
 *  par. No price at all is unpriced. */
function makerLeg(
  r: MakerReplayed,
  l: { bucket: string; amount: number },
  collSymbol: string,
  debtSymbol: string,
): FlowLeg {
  if (!COLL_KEYS.has(l.bucket))
    return flowLeg({
      bucket: l.bucket,
      amount: l.amount,
      symbol: debtSymbol,
      price: 1,
      priceNote: makerParNote(debtSymbol),
      face: true,
      ...(l.bucket === MK.fee ? { accrual: true } : {}),
    });
  return flowLeg({
    bucket: l.bucket,
    amount: l.amount,
    symbol: collSymbol,
    price: r.price > 0 ? r.price : null,
    block: makerPriceBlock(r.priceAt),
    priceNote: makerRowPriceNote(r.priceAt),
    ...(atLatestRead(r) ? { basis: MAKER_TODAY_BASIS } : {}),
  });
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
  /** The block the live read stands at. */
  block?: number | null;
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
  /** The block each stored day's price was read at, by UTC day, where the
   *  store's route states it. */
  dailyBlocks?: ReadonlyMap<number, number> | null;
  /** The ilk's feed is capped (LockStake). */
  capped?: boolean;
}

/** The per-row replay. */
export function replayMaker(events: MakerFlowEvent[], o: MakerFlowOptions): MakerReplayed[] {
  const today = Math.floor(o.now / DAY_S);
  const livePrice = o.live?.price != null && o.live.price > 0 ? o.live.price : null;
  const daily = o.daily && o.daily.length > 0 ? o.daily : null;
  const byDay = new Map<number, number>(daily ?? []);
  // The store's last price on or before a day, else its first after.
  const storeNear = (day: number): [number, number] | null => {
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
    return hit >= 0 ? daily[hit] : daily[0];
  };
  const priced = events.filter((e) => e.price != null);
  const liveBlock = o.live?.block ?? null;
  const dayBlock = (day: number) => o.dailyBlocks?.get(day) ?? null;
  type Priced = { price: number; from: MakerPriceFrom; at: MakerRowPrice };
  const nearest = (ev: MakerFlowEvent): Priced => {
    const cands: { dt: number; price: number; block: number | null; from: MakerPriceFrom }[] = priced.map((p) => ({
      dt: Math.abs(p.ts - ev.ts),
      price: p.price as number,
      block: p.block,
      from: "nearest" as const,
    }));
    if (livePrice != null)
      cands.push({ dt: Math.abs(o.now - ev.ts), price: livePrice, block: liveBlock, from: "today" });
    cands.sort((a, b) => a.dt - b.dt);
    const c = cands[0];
    if (!c) return { price: 0, from: "nearest", at: { from: "nearest", block: null, eventBlock: ev.block } };
    return {
      price: c.price,
      from: c.from,
      at:
        c.from === "today"
          ? { from: "today", block: c.block, eventBlock: ev.block }
          : { from: "nearest", block: c.block, eventBlock: ev.block, staleDays: Math.floor(c.dt / DAY_S) },
    };
  };
  const priceOf = (ev: MakerFlowEvent): Priced => {
    if (ev.price != null) return { price: ev.price, from: "row", at: { from: "row", block: ev.block } };
    const day = Math.floor(ev.ts / DAY_S);
    if (day >= today && livePrice != null)
      return { price: livePrice, from: "today", at: { from: "today", block: liveBlock, eventBlock: ev.block } };
    const own = byDay.get(day);
    if (own != null)
      return { price: own, from: "store", at: { from: "store", day, dayBlock: dayBlock(day), eventBlock: ev.block } };
    const near = storeNear(day);
    if (near != null)
      return {
        price: near[1],
        from: "store-near",
        at: {
          from: "store-near",
          day: near[0],
          dayBlock: dayBlock(near[0]),
          eventBlock: ev.block,
          staleDays: Math.abs(day - near[0]),
        },
      };
    return nearest(ev);
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
    out.push({ ev, price: p.price, priceFrom: p.from, priceAt: o.capped ? { ...p.at, capped: true } : p.at, legs });
    ink = ev.inkAfter;
    debt = ev.debtAfter;
  }
  return out;
}

/** The fee's rate from each row to the next, compounded each second as the
 *  Vat's rate accumulator grows through Jug's rpow, as a continuous fraction
 *  a year: ln(the next row's rate over this row's) over the time between
 *  them, so a duty unchanged between the rows meets the next row's figure;
 *  after the last row, to the live read's rate now, else the fee now. */
/** What a continuous annual `rate` grows a debt by over `seconds`. */
export const makerGrowth = (rate: number, seconds: number): number => Math.exp(rate * (seconds / ONE_YEAR_S));

export function makerFeeRates(replayed: MakerReplayed[], o: MakerFlowOptions): number[] {
  return makerFeeRateFrom(replayed, o).map((r) => r.rate);
}

/** Each stretch's rate with the branch that gave it (lib/makerdao/price-notes.ts
 *  `makerFactorNote` names it): the next row's accumulator, the live read's,
 *  the live stability fee, or the rate carried from the stretch before. A row
 *  whose accumulator is missing or zero gives no rate (not a number): the
 *  debt has no factor there, never a log of zero. */
export function makerFeeRateFrom(replayed: MakerReplayed[], o: MakerFlowOptions): MakerRateFrom[] {
  const out: MakerRateFrom[] = [];
  const ok = (v: number | null | undefined): v is number => v != null && Number.isFinite(v) && v > 0;
  for (let i = 0; i < replayed.length; i++) {
    const a = replayed[i].ev;
    const b = replayed[i + 1]?.ev;
    const prev = out[i - 1];
    const carried = (): MakerRateFrom =>
      prev && prev.from !== "none"
        ? { from: "carried", rate: prev.rate, block: a.block }
        : prev
          ? { from: "none", rate: Number.NaN, block: a.block }
          : { from: "carried", rate: 0, block: a.block };
    if (b) {
      if (!ok(a.rate) || !ok(b.rate)) out.push({ from: "none", rate: Number.NaN, block: a.block });
      else if (b.ts - a.ts > 0)
        out.push({
          from: "rows",
          rate: Math.log(b.rate / a.rate) / ((b.ts - a.ts) / ONE_YEAR_S),
          block: a.block,
          toBlock: b.block,
        });
      else out.push(carried());
    } else if (ok(o.live?.rate) && ok(a.rate) && o.now - a.ts > 0)
      out.push({
        from: "live",
        rate: Math.log((o.live!.rate as number) / a.rate) / ((o.now - a.ts) / ONE_YEAR_S),
        block: a.block,
        liveBlock: o.live?.block ?? null,
      });
    else if (o.live?.feeApr != null && Number.isFinite(o.live.feeApr) && o.live.feeApr > -1)
      out.push({ from: "fee", rate: Math.log(1 + o.live.feeApr), block: a.block });
    else out.push(carried());
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
    // A row valued without the OSM price at its block (only a liquidation's
    // is stored): its collateral flows rest on the price it took.
    // Each names the price's block beside the event's (ui-jobs 743).
    const at = makerRowPriceNote(r.priceAt);
    // A row at its own day's close is the decided basis, stated once in the
    // flows note (makerdao-flows-note.tsx); a row priced from another day
    // stays incomplete and says which price it took (ui-jobs 743).
    const why =
      r.priceFrom === "store-near"
        ? `${o.collSymbol} at ${at}: no price is stored for its day.`
        : r.priceFrom === "nearest" || atLatestRead(r)
          ? `${o.collSymbol} at ${at}: no daily price is stored for this ilk.`
          : null;
    const unsure =
      why && (r.ev.inkAfter > DUST || r.legs.some((l) => COLL_KEYS.has(l.bucket)))
        ? [{ side: "collateral" as const, why, held: true }]
        : [];
    return {
      id: r.ev.id,
      ts: r.ev.ts,
      block: r.ev.block,
      ...(unsure.length ? { unsure } : {}),
      tick:
        r.ev.kind === "grab" ? "liquidation" : moved.coll && moved.debt ? "both" : moved.debt ? "debt" : "collateral",
      // Each leg the shown product: the amount at six decimals × the price
      // as shown, to the cent; the debt at its $1 par (ui-jobs 743).
      legs: r.legs.map((l) => makerLeg(r, l, o.collSymbol, o.debtSymbol)),
      tx: r.ev.tx,
      // The card counts the owner's transactions; a liquidation is a keeper's.
      countsTx: r.ev.kind !== "grab",
      ...(r.ev.byOther ? { byOther: true } : {}),
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
  // Each with the block its read stands at, for the held figure's receipt.
  const collObs = new Map<number, [number, number | null]>();
  for (const [d, usd] of o.daily ?? []) if (d <= today && usd > 0) collObs.set(d, [usd, o.dailyBlocks?.get(d) ?? null]);
  for (const r of replayed)
    if (r.price > 0) collObs.set(Math.floor(r.ev.ts / DAY_S), [r.price, makerPriceBlock(r.priceAt)]);
  if (livePrice != null && open) collObs.set(today, [livePrice, o.live?.block ?? null]);
  // The debt's price each day: $1 plus the fee built on what the last row
  // recorded by the day's close, compounded each second to the next row's
  // figure (or the live read's).
  // Each names the row it grows from and the row (or live read) whose
  // accumulator its rate meets.
  const debtObs: DayObs[] = [];
  const debtNotes: Record<number, string> = {};
  const rateFrom = makerFeeRateFrom(replayed, o);
  let ei = 0;
  for (let d = firstDay; d <= endDay; d++) {
    const end = Math.min((d + 1) * DAY_S, o.now);
    while (ei + 1 < replayed.length && replayed[ei + 1].ev.ts <= end) ei++;
    const e = replayed[ei].ev;
    if (e.ts <= end) {
      // No rate: not a number, a day with no factor (FlowTimeline.dailyPrices).
      debtObs.push([d, makerGrowth(rates[ei], Math.max(0, end - e.ts)), e.block]);
      const note = makerFactorNote(rateFrom[ei]);
      if (note) debtNotes[d] = note;
    } else debtObs.push([d, 1, null]);
  }

  // Now: the live read where the page has one, else the last row with the
  // fee grown since.
  const nowColl = open ? (o.live?.ink ?? last.ev.inkAfter) : 0;
  const nowDebt = open
    ? (o.live?.debt ?? last.ev.debtAfter * makerGrowth(rates[rates.length - 1], o.now - last.ev.ts))
    : 0;
  const priceNow = livePrice ?? last.price;

  return {
    buckets,
    days,
    live: {
      collateralUsd: shownUsd(nowColl, priceNow),
      debtUsd: Number.isFinite(nowDebt) ? shownUsd(nowDebt, 1) : 0,
      assets: open
        ? [
            ...(nowColl > DUST
              ? [
                  {
                    side: "collateral" as const,
                    symbol: o.collSymbol,
                    amount: nowColl,
                    usd: shownUsd(nowColl, priceNow),
                    // The live read's OSM price at its block; else the last
                    // row's, its block named and not complete (ui-jobs 743).
                    ...(priceNow > 0
                      ? {
                          priced:
                            livePrice != null
                              ? livePriced(livePrice, o.live?.block, o.now, { source: "the ilk's OSM price now" })
                              : {
                                  day: Math.floor(o.now / DAY_S),
                                  series: false,
                                  price: priceNow,
                                  block: makerPriceBlock(last.priceAt),
                                },
                        }
                      : { unpriced: true as const }),
                  },
                ]
              : []),
            ...(nowDebt > DUST
              ? [
                  {
                    side: "debt" as const,
                    symbol: o.debtSymbol,
                    amount: nowDebt,
                    usd: shownUsd(nowDebt, 1),
                    priced: livePriced(1, null, o.now, { face: true }),
                  },
                ]
              : !Number.isFinite(nowDebt) && last.ev.debtAfter > DUST
                ? // No rate to grow it by: the debt has no figure, never $0.
                  [
                    {
                      side: "debt" as const,
                      symbol: o.debtSymbol,
                      amount: last.ev.debtAfter,
                      usd: 0,
                      unpriced: true as const,
                    },
                  ]
                : []),
          ]
        : [],
    },
    todayPrices: { [coll]: priceNow, [debt]: 1 },
    dailyPrices: {
      [coll]: [...collObs].map(([d, [usd, block]]) => [d, usd, block] as DayObs).sort((a, b) => a[0] - b[0]),
      [debt]: debtObs,
    },
    factorNotes: { [debt]: debtNotes },
    seriesCarry: true,
    ...(o.daily && o.daily.length > 0
      ? {}
      : {
          carriedWhy: {
            [coll]: "no daily price is stored for this ilk, so a day between events keeps the last event's price.",
          },
        }),
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
    // A flow at the latest read's price stands on another basis (makerLeg).
    priceBasis: { collateral: MAKER_BLOCK_BASIS, debt: MAKER_BLOCK_BASIS },
    restNote: {
      collateral: `the change in ${collSymbol}'s price since each flow`,
      debt: "the stability fee built up on the debt since the vault's last event",
    },
    basis: {
      collateral: daily
        ? "Each flow is valued at Maker's oracle price at the close of its day, a liquidation at the price at its block."
        : "Each flow is valued at the nearest recorded Maker oracle price: a liquidation's block, or the latest block's.",
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
      compound: true,
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
  /** Unix seconds now: a past event priced live stands on another basis. */
  nowSec = Number.POSITIVE_INFINITY,
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
      legs: r.legs.map((l) => makerLeg(r, l, collSymbol, debtSymbol)),
      sides: {
        collateral: {
          // No price on the vault: not a number, never $0 (ui-jobs 743).
          before: lastOf.price > 0 ? shownUsd(Math.max(0, collAfter - collMove), lastOf.price) : Number.NaN,
          after: lastOf.price > 0 ? shownUsd(collAfter, lastOf.price) : Number.NaN,
          amount: collMove,
          symbol: collSymbol,
          held: collAfter,
        },
        debt: {
          before: shownUsd(Math.max(0, debtAfter - debtMove), 1),
          after: shownUsd(debtAfter, 1),
          amount: debtMove,
          symbol: debtSymbol,
          held: debtAfter,
        },
      },
      ...(Number.isFinite(rates[i]) ? { rate: rates[i] * 100 } : {}),
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
