// Lifetime flows for a Dolomite account, Account.Info = (owner, account
// number): the page's rows replayed into the day rows the Lifetime flows panel
// reads (lib/shared/flows-timeline.ts; rails-ops
// reference/lifetime-flows-scrubber.md, "Dolomite").
// ----------------------------------------------------------------------------
// An account holds one SIGNED balance per market: above zero it supplies,
// below zero it owes (the core has no Borrow action), and every market counts
// against one margin line. So the panel is in USD with an asset per market,
// as Compound V2's is. Each row states its market's balance just before and
// after it as the core held it: the par before and after × the market's index
// at the row's block (lib/sources/api/dolomite-timeline.ts). Par is constant
// between two rows of a market, so per market, signed:
//
//     before − after at the market's last row = interest (earned above zero,
//                                               accrued below)
//     after − before                          = the act (the row's deltaWei)
//
// An act that crosses zero splits there: a withdrawal past the balance is
// Withdrawn up to zero and Borrowed past it, a deposit into a debt Repaid up
// to zero and Deposited past it. The act's line is named by the row's kind
// (deposit, withdraw, transfer, trade, liquidation) and the side it lands on.
// A trade moves value between two markets of the account: what it sold leaves
// one market (Sold in trades) and what it bought enters the other (Bought in
// trades); no token enters or leaves Dolomite.
//
// Between rows a balance grows by its market's index (`FlowIndexes`, basis
// "dolomite-rows"): every row carries the market's supply and borrow index at
// its block, so a balance on a later day is the recorded one × the index then
// ÷ the index at the row, the index running in a straight line from one of the
// account's rows on the market to the next; after the last, to the live read
// (wei ÷ par now), else at the market's rate now.
//
// Prices: each row at Dolomite's oracle price at or before its block where the
// route serves it (`oraclePrice`), else the market's price that day in the
// shared daily price store (the last LogOraclePrice of the day; every block
// with an event on a market carries one), else the store's last price before
// it, else the nearest priced row's; between events the store's price for the
// day, else the last one carried (`seriesCarry`); today's is the live read's.
//
// Pure: tested offline in scripts/verify/verify-dolomite-flows.ts.

import type { BaseActivityEvent, DolomiteContext, DolomiteEventType } from "@/lib/shared/types/event-shape";
import { isDolomiteEvent } from "@/lib/shared/types/event-shape";
import type { AssetBalance, FocusEvent } from "@/lib/shared/flow-focus";
import type {
  FlowBucket,
  FlowEvent,
  FlowIndexes,
  FlowSide,
  FlowTimeline,
  FlowWords,
} from "@/lib/shared/flows-timeline";
import { daysFromEvents } from "@/lib/shared/flows-timeline";
import { externalActor } from "@/lib/shared/external-actor";

const DAY_S = 86_400;
/** Dolomite's year for its rates (lib/dolomite/asset-catalog.ts). */
const ONE_YEAR_S = 31_536_000;
const DUST = 1e-12;

/** Bucket keys. */
export const DL = {
  deposited: "dl-deposited",
  received: "dl-received",
  bought: "dl-bought",
  seizedIn: "dl-seized-in",
  earned: "dl-earned",
  withdrawn: "dl-withdrawn",
  sent: "dl-sent",
  sold: "dl-sold",
  seized: "dl-seized",
  paidOut: "dl-paid-out",
  borrowed: "dl-borrowed",
  borrowedSent: "dl-borrowed-sent",
  borrowedTrade: "dl-borrowed-trade",
  borrowedLiq: "dl-borrowed-liq",
  accrued: "dl-accrued",
  repaid: "dl-repaid",
  repaidTransfer: "dl-repaid-transfer",
  repaidTrade: "dl-repaid-trade",
  liquidated: "dl-liquidated",
  writtenOff: "dl-written-off",
} as const;

const SUPPLY_KEYS = new Set<string>([
  DL.deposited,
  DL.received,
  DL.bought,
  DL.seizedIn,
  DL.earned,
  DL.withdrawn,
  DL.sent,
  DL.sold,
  DL.seized,
  DL.paidOut,
]);
const OUT_KEYS = new Set<string>([
  DL.withdrawn,
  DL.sent,
  DL.sold,
  DL.seized,
  DL.paidOut,
  DL.repaid,
  DL.repaidTransfer,
  DL.repaidTrade,
  DL.liquidated,
  DL.writtenOff,
]);
const ACCRUAL_KEYS = new Set<string>([DL.earned, DL.accrued]);

/** Every bucket the family can fill, in drawing order. */
const BUCKETS: FlowBucket[] = [
  { key: DL.deposited, label: "Deposited", event: "Deposit", side: "collateral", dir: "in" },
  {
    key: DL.received,
    label: "Received by transfer",
    event: "Received",
    side: "collateral",
    dir: "in",
    hatch: "grid",
  },
  { key: DL.bought, label: "Bought in trades", event: "Trade", side: "collateral", dir: "in", hatch: "checker" },
  {
    key: DL.seizedIn,
    label: "Seized as liquidator",
    event: "Seized collateral received",
    side: "collateral",
    dir: "in",
    hatch: "horizontal",
  },
  // Interest is dashed (rails-ops reference/lifetime-flows-scrubber.md): the
  // event's words name none, since it moves on most events.
  { key: DL.earned, label: "Interest earned", event: "", side: "collateral", dir: "in", hatch: "dashes" },
  { key: DL.withdrawn, label: "Withdrawn", event: "Withdraw", side: "collateral", dir: "out" },
  { key: DL.sent, label: "Sent by transfer", event: "Sent", side: "collateral", dir: "out", hatch: "dots" },
  { key: DL.sold, label: "Sold in trades", event: "Trade", side: "collateral", dir: "out", hatch: "vertical" },
  {
    key: DL.seized,
    label: "Seized in liquidations",
    event: "Collateral seized",
    side: "collateral",
    dir: "out",
    tone: "liquidation",
    hatch: "forward",
    link: "liquidation",
  },
  {
    key: DL.paidOut,
    label: "Paid as liquidator",
    event: "Liquidation payout",
    side: "collateral",
    dir: "out",
    hatch: "cross",
  },
  { key: DL.borrowed, label: "Borrowed", event: "Borrow", side: "debt", dir: "in" },
  {
    key: DL.borrowedSent,
    label: "Borrowed to send by transfer",
    event: "Borrow (sent)",
    side: "debt",
    dir: "in",
    hatch: "grid",
  },
  { key: DL.borrowedTrade, label: "Borrowed in trades", event: "Trade", side: "debt", dir: "in", hatch: "checker" },
  {
    key: DL.borrowedLiq,
    label: "Borrowed to liquidate",
    event: "Liquidation payout",
    side: "debt",
    dir: "in",
    hatch: "horizontal",
  },
  { key: DL.accrued, label: "Interest accrued", event: "", side: "debt", dir: "in", hatch: "dashes" },
  { key: DL.repaid, label: "Repaid", event: "Repay", side: "debt", dir: "out" },
  {
    key: DL.repaidTransfer,
    label: "Repaid by a transfer in",
    event: "Repay (received)",
    side: "debt",
    dir: "out",
    hatch: "dots",
  },
  { key: DL.repaidTrade, label: "Repaid by trades", event: "Trade", side: "debt", dir: "out", hatch: "vertical" },
  {
    key: DL.liquidated,
    label: "Repaid by liquidators",
    event: "Liquidated",
    side: "debt",
    dir: "out",
    tone: "liquidation",
    hatch: "forward",
    link: "liquidation",
  },
  {
    key: DL.writtenOff,
    label: "Written off by vaporization",
    event: "Vaporized",
    side: "debt",
    dir: "out",
    tone: "liquidation",
    hatch: "cross",
    link: "liquidation",
  },
];

/** Each kind's lines: a rise lands on [collateral in, debt out], a fall on
 *  [collateral out, debt in]. Every kind but a transfer or a trade moves one
 *  way; its other pair is there for completeness and named for the nearest
 *  act (on 1 Oct 2026 no row moved the other way). */
const ACT: Record<Exclude<DolomiteEventType, "call">, { up: [string, string]; down: [string, string] }> = {
  deposit: { up: [DL.deposited, DL.repaid], down: [DL.withdrawn, DL.borrowed] },
  withdraw: { up: [DL.deposited, DL.repaid], down: [DL.withdrawn, DL.borrowed] },
  transfer_in: { up: [DL.received, DL.repaidTransfer], down: [DL.sent, DL.borrowedSent] },
  transfer_out: { up: [DL.received, DL.repaidTransfer], down: [DL.sent, DL.borrowedSent] },
  trade_taker: { up: [DL.bought, DL.repaidTrade], down: [DL.sold, DL.borrowedTrade] },
  trade_maker: { up: [DL.bought, DL.repaidTrade], down: [DL.sold, DL.borrowedTrade] },
  // The borrower's two legs: its debt repaid by the liquidator, its
  // collateral taken.
  liquidation: { up: [DL.deposited, DL.liquidated], down: [DL.seized, DL.borrowed] },
  seize_out: { up: [DL.deposited, DL.liquidated], down: [DL.seized, DL.borrowed] },
  // The liquidator's two legs: the collateral it took, the debt it paid.
  seize_in: { up: [DL.seizedIn, DL.repaid], down: [DL.paidOut, DL.borrowedLiq] },
  liquidation_payout: { up: [DL.seizedIn, DL.repaid], down: [DL.paidOut, DL.borrowedLiq] },
  vaporize: { up: [DL.deposited, DL.writtenOff], down: [DL.seized, DL.borrowed] },
};

/** Every line the family can draw, in drawing order. */
export const dolomiteFlowBuckets = (): FlowBucket[] => BUCKETS;

const LIQ_KINDS = new Set<DolomiteEventType>(["liquidation", "seize_out", "vaporize"]);

/** One row as the replay reads it: token amounts in whole tokens, signed
 *  (below zero is debt). */
export interface DolomiteFlowRow {
  id: string;
  /** Unix seconds. */
  ts: number;
  block: number;
  tx: string;
  kind: Exclude<DolomiteEventType, "call">;
  /** The market id, the asset of the model. */
  market: string;
  symbol: string;
  decimals: number;
  /** The market's balance just before and after the row, signed. */
  before: number;
  after: number;
  /** The market's supply and borrow index at the row's block. */
  supplyIndex: number;
  borrowIndex: number;
  /** The row's deltaWei, signed, for the checks. */
  amount: number | null;
  /** USD per token at or before the row's block, where the route served it. */
  price: number | null;
  /** Whether the account's owner made the transaction (false: a liquidator,
   *  another wallet's transfer in). */
  byOwner: boolean;
  /** A transfer to or from another account of the same owner. */
  ownTransfer: boolean;
}

const num = (s: string | undefined | null): number | null => {
  if (s == null || s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** The log index and leg the event id ends with (`action:tx:log:leg`). */
function logOf(id: string): number {
  const m = /[:-](\d+)[:-][a-z_]+$/.exec(id);
  return m ? Number(m[1]) : 0;
}

/** The page's rows as the replay reads them, oldest first. Null where a row
 *  that moves a balance carries no index (a payload from before the route sent
 *  them): the replay then cannot state the balances the core held. */
export function dolomiteFlowRows(events: readonly BaseActivityEvent[], owner: string): DolomiteFlowRow[] | null {
  const list = events.filter(isDolomiteEvent);
  // The route answers in chain order; a list handed newest first is turned.
  const asc = list.length > 1 && list[0].blockNumber > list[list.length - 1].blockNumber ? [...list].reverse() : list;
  const sorted = asc
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.blockNumber - b.e.blockNumber || a.i - b.i)
    .map((x) => x.e);
  const out: DolomiteFlowRow[] = [];
  const w = owner.toLowerCase();
  for (const e of sorted) {
    const c: DolomiteContext = e.context.data;
    if (c.eventType === "call" || c.marketId < 0) continue;
    const before = num(c.balanceBefore);
    const after = num(c.balanceAfter);
    const si = num(c.index?.supply);
    const bi = num(c.index?.borrow);
    if (before == null || after == null || si == null || bi == null || !(si > 0) || !(bi > 0)) return null;
    const isTransfer = c.eventType === "transfer_in" || c.eventType === "transfer_out";
    out.push({
      id: e.id,
      ts: e.timestamp,
      block: e.blockNumber,
      tx: e.txHash,
      kind: c.eventType,
      market: String(c.marketId),
      symbol: c.marketSymbol,
      decimals: c.decimals,
      before,
      after,
      supplyIndex: si / 1e18,
      borrowIndex: bi / 1e18,
      amount: num(c.weiDelta),
      price: c.oraclePrice?.usd != null && c.oraclePrice.usd > 0 ? c.oraclePrice.usd : null,
      byOwner:
        LIQ_KINDS.has(c.eventType) || c.eventType === "seize_in" || c.eventType === "liquidation_payout"
          ? false
          : c.eventType === "transfer_in" && c.counterparty != null && c.counterparty !== w
            ? false
            : externalActor({ txFrom: c.txFrom, poolCaller: c.caller }, w) == null,
      ownTransfer: isTransfer && c.counterparty != null && c.counterparty === w,
    });
  }
  return out;
}

/** The daily price store's series key for a market (rails-ops
 *  reference/daily-prices.md). */
export const dolomiteSeriesKey = (marketId: string | number) => `dolomite:${marketId}`;

/** What the page's live read states now, per market. */
export interface DolomiteLiveMarket {
  /** The signed balance now (wei, whole tokens). */
  balance: number;
  /** The market's supply or borrow index now (wei ÷ par), on the balance's
   *  side; null where the account holds nothing. */
  supplyIndex: number | null;
  borrowIndex: number | null;
  price: number | null;
  /** Yearly rates as fractions. */
  supplyApr: number | null;
  borrowApr: number | null;
}

export interface DolomiteFlowOptions {
  /** Unix seconds now; the page's clock. */
  now: number;
  /** The live read by market id; null where it has not landed or failed (a
   *  market it does not list is held at zero). */
  live: Record<string, DolomiteLiveMarket> | null;
  /** A daily price per market, [UTC day, USD] ascending (the shared daily
   *  price store's): a row the route did not price takes its day's. */
  dailyPrices?: Record<string, [number, number][]>;
}

/** How a row's price was found. */
export type DolomitePriceBasis = "block" | "day" | "live" | "carried" | "nearest" | "none";

/** A replayed row: its legs in tokens and the market's balances after it. */
export interface DolomiteReplayed {
  ev: DolomiteFlowRow;
  price: number;
  basis: DolomitePriceBasis;
  legs: { bucket: string; amount: number }[];
  /** The market's supply and debt after the row (magnitudes). */
  supply: number;
  debt: number;
}

/** The store's price for `day`, or the last before it. */
function storeOn(obs: [number, number][] | undefined, day: number): { usd: number; day: number } | null {
  if (!obs || obs.length === 0 || obs[0][0] > day) return null;
  let lo = 0;
  let hi = obs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (obs[mid][0] <= day) lo = mid;
    else hi = mid - 1;
  }
  return obs[lo][1] > 0 ? { usd: obs[lo][1], day: obs[lo][0] } : null;
}

/** The price each row is valued at, and how it was found. */
function pricesFor(rows: DolomiteFlowRow[], o: DolomiteFlowOptions): { price: number; basis: DolomitePriceBasis }[] {
  const today = Math.floor(o.now / DAY_S);
  const first = rows.map((r): { price: number; basis: DolomitePriceBasis } | null => {
    if (r.price != null) return { price: r.price, basis: "block" };
    const day = Math.floor(r.ts / DAY_S);
    const s = storeOn(o.dailyPrices?.[r.market], day);
    if (s && s.day === day) return { price: s.usd, basis: "day" };
    const live = o.live?.[r.market]?.price;
    if (day >= today && live != null && live > 0) return { price: live, basis: "live" };
    if (s) return { price: s.usd, basis: "carried" };
    return null;
  });
  return rows.map((r, i) => {
    const p = first[i];
    if (p) return p;
    let best: { ts: number; price: number } | null = null;
    rows.forEach((x, j) => {
      const q = first[j];
      if (!q || x.market !== r.market) return;
      if (!best || Math.abs(x.ts - r.ts) < Math.abs(best.ts - r.ts)) best = { ts: x.ts, price: q.price };
    });
    if (best) return { price: (best as { price: number }).price, basis: "nearest" as const };
    const live = o.live?.[r.market]?.price;
    return live != null && live > 0 ? { price: live, basis: "nearest" as const } : { price: 0, basis: "none" as const };
  });
}

/** The per-row replay. */
export function replayDolomite(rows: DolomiteFlowRow[], o: DolomiteFlowOptions): DolomiteReplayed[] {
  const prices = pricesFor(rows, o);
  const last = new Map<string, number>();
  return rows.map((ev, i) => {
    const m = ev.market;
    const legs: { bucket: string; amount: number }[] = [];
    const add = (bucket: string, amount: number) => {
      if (Math.abs(amount) > DUST) legs.push({ bucket, amount });
    };
    const prior = last.get(m) ?? 0;
    // Interest since the market's last row: the par did not move, so the
    // balance before sits on the same side of zero as the last one.
    if (prior > 0 || ev.before > 0) add(DL.earned, ev.before - prior);
    else if (prior < 0 || ev.before < 0) add(DL.accrued, -ev.before + prior);
    // The act, split where it crosses zero.
    const { before: b, after: a } = ev;
    const lines = a >= b ? ACT[ev.kind].up : ACT[ev.kind].down;
    if (a >= b) {
      // A rise: the debt part first (up to zero), then the supply part.
      const debtPart = b < 0 ? Math.min(a, 0) - b : 0;
      const supplyPart = a > 0 ? a - Math.max(b, 0) : 0;
      add(lines[1], debtPart);
      add(lines[0], supplyPart);
    } else {
      const supplyPart = b > 0 ? b - Math.max(a, 0) : 0;
      const debtPart = a < 0 ? Math.min(b, 0) - a : 0;
      add(lines[0], supplyPart);
      add(lines[1], debtPart);
    }
    last.set(m, a);
    return {
      ev,
      price: prices[i].price,
      basis: prices[i].basis,
      legs,
      supply: Math.max(a, 0),
      debt: Math.max(-a, 0),
    };
  });
}

// ── The indexes between rows ────────────────────────────────────────────────

type Knot = [ts: number, index: number];

/** A market's index at `ts`: a straight line between the knots, flat before
 *  the first, and past the last at `apr` (simple) where given, else flat. */
function indexAt(knots: Knot[], ts: number, apr: number | null): number | null {
  if (knots.length === 0) return null;
  if (ts <= knots[0][0]) return knots[0][1];
  let lo = 0;
  let hi = knots.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (knots[mid][0] <= ts) lo = mid;
    else hi = mid - 1;
  }
  const [t0, i0] = knots[lo];
  const next = knots[lo + 1];
  if (!next) return i0 * (1 + (apr ?? 0) * ((ts - t0) / ONE_YEAR_S));
  const [t1, i1] = next;
  return t1 > t0 ? i0 + ((i1 - i0) * (ts - t0)) / (t1 - t0) : i1;
}

/** Each market's supply and borrow index knots: one per row, and now from
 *  the live read where it states the market's side. */
export interface DolomiteIndexes {
  supply: Map<string, Knot[]>;
  borrow: Map<string, Knot[]>;
  supplyApr: Map<string, number | null>;
  borrowApr: Map<string, number | null>;
}

function dolomiteIndexes(replayed: DolomiteReplayed[], o: DolomiteFlowOptions): DolomiteIndexes {
  const supply = new Map<string, Knot[]>();
  const borrow = new Map<string, Knot[]>();
  const push = (map: Map<string, Knot[]>, m: string, k: Knot) => {
    const list = map.get(m) ?? [];
    // One block's rows share the index: keep the knots strictly rising in time.
    if (list.length > 0 && list[list.length - 1][0] >= k[0]) list[list.length - 1] = k;
    else list.push(k);
    map.set(m, list);
  };
  const lastTs = new Map<string, number>();
  for (const r of replayed) {
    push(supply, r.ev.market, [r.ev.ts, r.ev.supplyIndex]);
    push(borrow, r.ev.market, [r.ev.ts, r.ev.borrowIndex]);
    lastTs.set(r.ev.market, r.ev.ts);
  }
  for (const [m, ts] of lastTs) {
    const l = o.live?.[m];
    if (!l || !(o.now > ts)) continue;
    if (l.supplyIndex != null && l.supplyIndex > 0) push(supply, m, [o.now, l.supplyIndex]);
    if (l.borrowIndex != null && l.borrowIndex > 0) push(borrow, m, [o.now, l.borrowIndex]);
  }
  const supplyApr = new Map<string, number | null>();
  const borrowApr = new Map<string, number | null>();
  for (const m of lastTs.keys()) {
    supplyApr.set(m, o.live?.[m]?.supplyApr ?? null);
    borrowApr.set(m, o.live?.[m]?.borrowApr ?? null);
  }
  return { supply, borrow, supplyApr, borrowApr };
}

/** A balance a row recorded at `anchorTs`, at `ts`: grown by its market's
 *  index since. */
function grownAt(ix: DolomiteIndexes, market: string, side: FlowSide, recorded: number, anchorTs: number, ts: number) {
  if (!(recorded > 0) || ts <= anchorTs) return recorded;
  const knots = (side === "collateral" ? ix.supply : ix.borrow).get(market) ?? [];
  const apr = (side === "collateral" ? ix.supplyApr : ix.borrowApr).get(market) ?? null;
  const at = indexAt(knots, ts, apr);
  const anchor = indexAt(knots, anchorTs, apr);
  return at != null && anchor != null && anchor > 0 ? (recorded * at) / anchor : recorded;
}

// ── The timeline ────────────────────────────────────────────────────────────

/** The replay with its indexes, for the timeline, the cards and the tests. */
export interface DolomiteFlowReplay {
  replayed: DolomiteReplayed[];
  indexes: DolomiteIndexes;
  /** Whether any balance went below zero: else the panel draws one bar. */
  borrower: boolean;
}

export function dolomiteFlowReplay(rows: DolomiteFlowRow[], o: DolomiteFlowOptions): DolomiteFlowReplay {
  const replayed = replayDolomite(rows, o);
  return {
    replayed,
    indexes: dolomiteIndexes(replayed, o),
    borrower: rows.some((r) => r.before < 0 || r.after < 0),
  };
}

/** What is held and owed now per market: the live read where it landed (a
 *  market it does not list is held at zero), else the last row's balance
 *  grown by the index. */
function nowBalances(rp: DolomiteFlowReplay, o: DolomiteFlowOptions) {
  const last = new Map<string, DolomiteReplayed>();
  for (const r of rp.replayed) last.set(r.ev.market, r);
  const out: { market: string; symbol: string; supply: number; debt: number }[] = [];
  for (const [m, r] of last) {
    if (o.live) {
      const b = o.live[m]?.balance ?? 0;
      out.push({ market: m, symbol: r.ev.symbol, supply: Math.max(b, 0), debt: Math.max(-b, 0) });
      continue;
    }
    out.push({
      market: m,
      symbol: r.ev.symbol,
      supply: grownAt(rp.indexes, m, "collateral", r.supply, r.ev.ts, o.now),
      debt: grownAt(rp.indexes, m, "debt", r.debt, r.ev.ts, o.now),
    });
  }
  return out;
}

/** The account's rows as the Lifetime flows panel's timeline, in USD. Null
 *  with no rows. */
export function dolomiteFlowTimeline(rows: DolomiteFlowRow[], o: DolomiteFlowOptions): FlowTimeline | null {
  if (rows.length === 0) return null;
  const rp = dolomiteFlowReplay(rows, o);
  const { replayed } = rp;
  const used = new Set(replayed.flatMap((r) => r.legs.map((l) => l.bucket)));
  // Deposited, withdrawn and the interest earned always; the debt's four
  // where the account borrowed; every other line where a row filled it.
  const base = new Set<string>([DL.deposited, DL.withdrawn, DL.earned]);
  if (rp.borrower) for (const k of [DL.borrowed, DL.accrued, DL.repaid]) base.add(k);
  const buckets = BUCKETS.filter((b) => base.has(b.key) || used.has(b.key));

  const flowEvents: FlowEvent[] = replayed.map((r) => {
    const moved = { coll: false, debt: false };
    for (const l of r.legs) {
      if (ACCRUAL_KEYS.has(l.bucket)) continue;
      if (SUPPLY_KEYS.has(l.bucket)) moved.coll = true;
      else moved.debt = true;
    }
    const m = r.ev.market;
    const balances: FlowEvent["balances"] = [];
    if (r.ev.before > 0 || r.ev.after > 0)
      balances.push({ asset: m, symbol: r.ev.symbol, side: "collateral", amount: r.supply, index: r.ev.supplyIndex });
    if (r.ev.before < 0 || r.ev.after < 0)
      balances.push({ asset: m, symbol: r.ev.symbol, side: "debt", amount: r.debt, index: r.ev.borrowIndex });
    const liq = LIQ_KINDS.has(r.ev.kind);
    return {
      id: r.ev.id,
      ts: r.ev.ts,
      block: r.ev.block,
      tick: liq ? "liquidation" : moved.coll && moved.debt ? "both" : moved.debt ? "debt" : "collateral",
      legs: r.legs.map((l) => ({ bucket: l.bucket, usd: l.amount * r.price, symbol: r.ev.symbol })),
      tx: r.ev.tx,
      countsTx: r.ev.byOwner,
      balances,
      prices: r.price > 0 && r.basis !== "nearest" && r.basis !== "none" ? [{ asset: m, usd: r.price }] : [],
    };
  });
  const days = daysFromEvents(
    buckets.map((b) => b.key),
    flowEvents,
  );

  const today = Math.floor(o.now / DAY_S);
  const held = nowBalances(rp, o);
  const open = held.some((h) => h.supply > DUST || h.debt > DUST);
  const lastTs = replayed[replayed.length - 1].ev.ts;
  const endDay = open ? Math.max(today, Math.floor(lastTs / DAY_S) + 1) : Math.floor(lastTs / DAY_S) + 1;

  // Prices by day: each market's rows' prices on their days, the store's on
  // the days between, the first row's standing for the days before it, and
  // today's live price.
  const todayPrice = (m: string) => {
    const p = o.live?.[m]?.price;
    return p != null && p > 0 ? p : null;
  };
  const dailyPrices: Record<string, [number, number][]> = {};
  const byMarket = new Map<string, Map<number, number>>();
  const firstDayOf = new Map<string, number>();
  const firstPriceOf = new Map<string, number>();
  for (const r of replayed) {
    const m = r.ev.market;
    const obs = byMarket.get(m) ?? new Map<number, number>();
    byMarket.set(m, obs);
    if (!firstDayOf.has(m)) firstDayOf.set(m, Math.floor(r.ev.ts / DAY_S));
    if (!(r.price > 0)) continue;
    if (!firstPriceOf.has(m)) firstPriceOf.set(m, r.price);
    if (r.basis === "block" || r.basis === "day" || r.basis === "live") obs.set(Math.floor(r.ev.ts / DAY_S), r.price);
  }
  for (const [m, obs] of byMarket) {
    const rowDays = new Set(obs.keys());
    for (const [d, p] of o.dailyPrices?.[m] ?? []) if (p > 0 && !rowDays.has(d) && d < today) obs.set(d, p);
    const d0 = firstDayOf.get(m)!;
    const p0 = firstPriceOf.get(m);
    if (p0 != null && ![...obs.keys()].some((d) => d <= d0)) obs.set(d0, p0);
    const p = todayPrice(m);
    if (open && p != null) obs.set(today, p);
    dailyPrices[m] = [...obs].sort((a, b) => a[0] - b[0]);
  }

  // Each market's indexes at each day's close, from its first row to the end.
  const indexes: FlowIndexes = { basis: "dolomite-rows", assets: {} };
  for (const m of byMarket.keys()) {
    const sKnots = rp.indexes.supply.get(m) ?? [];
    const bKnots = rp.indexes.borrow.get(m) ?? [];
    const list: [number, number | null, number | null][] = [];
    for (let d = firstDayOf.get(m)!; d <= endDay; d++) {
      const close = Math.min((d + 1) * DAY_S, o.now);
      list.push([
        d,
        indexAt(sKnots, close, rp.indexes.supplyApr.get(m) ?? null),
        indexAt(bKnots, close, rp.indexes.borrowApr.get(m) ?? null),
      ]);
    }
    indexes.assets[m] = list;
  }

  const assets: NonNullable<FlowTimeline["live"]["assets"]> = [];
  let collateralUsd = 0;
  let debtUsd = 0;
  for (const h of held) {
    const p = todayPrice(h.market) ?? dailyPrices[h.market]?.at(-1)?.[1] ?? 0;
    if (h.supply > DUST) {
      assets.push({ side: "collateral", symbol: h.symbol, amount: h.supply, usd: h.supply * p });
      collateralUsd += h.supply * p;
    }
    if (h.debt > DUST) {
      assets.push({ side: "debt", symbol: h.symbol, amount: h.debt, usd: h.debt * p });
      debtUsd += h.debt * p;
    }
  }
  const todayPrices: Record<string, number> = {};
  for (const m of byMarket.keys()) {
    const p = todayPrice(m) ?? dailyPrices[m]?.at(-1)?.[1];
    if (p != null && p > 0) todayPrices[m] = p;
  }

  return {
    buckets,
    days,
    live: { collateralUsd, debtUsd, assets },
    todayPrices,
    dailyPrices,
    seriesCarry: true,
    indexes,
    today: open ? today : endDay,
    words: dolomiteFlowWords(rp.borrower),
  };
}

/** The panel's words for a Dolomite account. */
export function dolomiteFlowWords(borrower: boolean): FlowWords {
  return {
    held: "Still supplied",
    restBySide: {
      collateral: "Market move and interest since the last event",
      ...(borrower ? { debt: "Market move and interest since the last event" } : {}),
    },
    restNote: {
      collateral:
        "the change in each market's Dolomite oracle price since its flows, and the interest each supply earned since its market's last event",
      debt: "the change in each borrowed asset's Dolomite oracle price since its flows, and the interest each debt built since its market's last event",
    },
    basis: {
      collateral: "Each flow is valued at Dolomite's oracle price for its market on its day.",
      debt: "Each flow is valued at Dolomite's oracle price for its market on its day.",
    },
    heldBasis: {
      collateral:
        "each market's balance after its last event by then, grown by the market's supply index (in a straight line between the account's rows, then to today's), at Dolomite's oracle price that day.",
      debt: "each market's debt after its last event by then, grown by the market's borrow index (in a straight line between the account's rows, then to today's), at Dolomite's oracle price that day.",
    },
    linePrices:
      "at each market's Dolomite oracle price at the end of each day, with the balances grown by their markets' index since the last event",
    moment: {
      noPrice: {
        collateral: "No Dolomite oracle price is recorded for this day, so each market is stated in tokens.",
        debt: "No Dolomite oracle price is recorded for this day, so each market is stated in tokens.",
      },
      notes: [],
    },
  };
}

// ── The cards ───────────────────────────────────────────────────────────────

/** The rows as the event cards' sums read them (lib/shared/flow-focus.ts):
 *  each row's legs in USD at the row's price and in tokens, ascending; the
 *  interest legs are accruals, not the event's act. */
export function dolomiteFocusEvents(rp: DolomiteFlowReplay): FocusEvent[] {
  return rp.replayed.map((r) => ({
    id: r.ev.id,
    ts: r.ev.ts,
    tx: r.ev.tx,
    legs: r.legs.map((l) => ({
      bucket: l.bucket,
      usd: l.amount * r.price,
      amount: l.amount,
      symbol: r.ev.symbol,
      ...(ACCRUAL_KEYS.has(l.bucket) ? { accrual: true } : {}),
    })),
  }));
}

/** The account once an event's transaction had run, by side: each market in
 *  tokens (the markets the transaction touched as their rows recorded them,
 *  the others grown by their index to the block) at the price that day, the
 *  side's USD, and whether the transaction moved the side. The shape the
 *  shared cards read (components/shared/ctoken-event-ledger.tsx). */
export interface DolomiteEventState {
  balances: Record<FlowSide, AssetBalance[]>;
  held: Record<FlowSide, number | null>;
  heldBefore: Record<FlowSide, number | null>;
  moved: Record<FlowSide, boolean>;
}

export function dolomiteEventStates(
  rp: DolomiteFlowReplay,
  o: Pick<DolomiteFlowOptions, "live" | "dailyPrices">,
): Map<string, DolomiteEventState> {
  const out = new Map<string, DolomiteEventState>();
  const { replayed, indexes } = rp;
  // Per market: the signed balance recorded last, when, and the latest price
  // a row of the market took (and its day).
  const rec = new Map<string, { symbol: string; bal: number; ts: number }>();
  const lastPrice = new Map<string, { usd: number; day: number }>();
  const firstPrice = new Map<string, number>();
  for (const r of replayed) if (r.price > 0 && !firstPrice.has(r.ev.market)) firstPrice.set(r.ev.market, r.price);
  // A market the transaction left alone takes the newer of its latest row's
  // price and the daily store's for the event's day, as the bars do that day.
  const priceOf = (m: string, day: number) => {
    const row = lastPrice.get(m);
    const store = storeOn(o.dailyPrices?.[m], day);
    if (store && (!row || store.day > row.day)) return store.usd;
    return row?.usd ?? firstPrice.get(m) ?? o.live?.[m]?.price ?? null;
  };
  let i = 0;
  while (i < replayed.length) {
    const tx = replayed[i].ev.tx;
    let j = i;
    while (j + 1 < replayed.length && replayed[j + 1].ev.tx === tx) j++;
    // Before the transaction: each touched market's balance before its first
    // row in it (interest to the block included).
    const before = new Map<string, number>();
    const moved = { collateral: false, debt: false };
    for (let k = i; k <= j; k++) {
      const r = replayed[k];
      if (!before.has(r.ev.market)) before.set(r.ev.market, r.ev.before);
      for (const l of r.legs) {
        if (ACCRUAL_KEYS.has(l.bucket)) continue;
        if (SUPPLY_KEYS.has(l.bucket)) moved.collateral = true;
        else moved.debt = true;
      }
      rec.set(r.ev.market, { symbol: r.ev.symbol, bal: r.ev.after, ts: r.ev.ts });
      if (r.price > 0 && r.basis !== "nearest" && r.basis !== "none")
        lastPrice.set(r.ev.market, { usd: r.price, day: Math.floor(r.ev.ts / DAY_S) });
    }
    const ts = replayed[j].ev.ts;
    const day = Math.floor(ts / DAY_S);
    const bySym: Record<FlowSide, Map<string, AssetBalance>> = { collateral: new Map(), debt: new Map() };
    const usd: Record<FlowSide, number | null> = { collateral: 0, debt: 0 };
    const usdBefore: Record<FlowSide, number | null> = { collateral: 0, debt: 0 };
    for (const [m, c] of rec) {
      const p = priceOf(m, day);
      const prior = before.get(m);
      // A market the transaction moved stands as its rows recorded it; one it
      // left alone, grown by its index to the block, the same before and after.
      const side = (v: number): FlowSide => (v < 0 ? "debt" : "collateral");
      const after =
        prior != null ? c.bal : Math.sign(c.bal) * grownAt(indexes, m, side(c.bal), Math.abs(c.bal), c.ts, ts);
      const was = prior ?? after;
      for (const s of ["collateral", "debt"] as const) {
        const a = s === "collateral" ? Math.max(after, 0) : Math.max(-after, 0);
        const b0 = s === "collateral" ? Math.max(was, 0) : Math.max(-was, 0);
        if (!(a > DUST) && !(b0 > DUST)) continue;
        const b = bySym[s].get(c.symbol) ?? { symbol: c.symbol, amount: 0, before: 0, price: p };
        b.amount += a;
        b.before += b0;
        if (b.price == null) b.price = p;
        bySym[s].set(c.symbol, b);
        const addTo = (into: Record<FlowSide, number | null>, v: number) => {
          if (v <= DUST) return;
          into[s] = p == null || into[s] == null ? null : (into[s] as number) + v * p;
        };
        addTo(usd, a);
        addTo(usdBefore, b0);
      }
    }
    const state: DolomiteEventState = {
      balances: { collateral: [...bySym.collateral.values()], debt: [...bySym.debt.values()] },
      held: usd,
      heldBefore: usdBefore,
      moved,
    };
    for (let k = i; k <= j; k++) out.set(replayed[k].ev.id, state);
    i = j + 1;
  }
  return out;
}

/** How the rows with a flow were priced. */
export function dolomitePricing(rp: DolomiteFlowReplay): Record<DolomitePriceBasis, number> {
  const out: Record<DolomitePriceBasis, number> = { block: 0, day: 0, live: 0, carried: 0, nearest: 0, none: 0 };
  for (const r of rp.replayed) {
    if (!r.legs.some((l) => !ACCRUAL_KEYS.has(l.bucket))) continue;
    out[r.basis]++;
  }
  return out;
}

/** The leg's sign in its side's sum: an outflow subtracts. */
export const dolomiteLegSign = (bucket: string): 1 | -1 => (OUT_KEYS.has(bucket) ? -1 : 1);
export const isDolomiteSupplyBucket = (bucket: string): boolean => SUPPLY_KEYS.has(bucket);
