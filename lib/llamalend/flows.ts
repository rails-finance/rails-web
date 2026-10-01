// Lifetime flows for a LlamaLend position (one borrower in one isolated
// market, the (controller, user) pair): the page's rows replayed into the day
// rows the Lifetime flows panel reads (lib/shared/flows-timeline.ts; rails-ops
// reference/lifetime-flows-scrubber.md, "LlamaLend").
// ----------------------------------------------------------------------------
// Token units by charter. A market's AMM prices its collateral in the
// market's borrowed token (`price_oracle`), and only a crvUSD market's figures
// ever read as dollars, so every figure is in the borrowed token
// (`FlowTimeline.unit`), each collateral flow converted at the AMM's oracle
// price at its block.
//
// Each row states the position after it (the Controller's UserState after-
// image: collateral in the bands and debt) and its move (the event's
// amounts), so the replay splits every gap since the row before:
//
//     debt after − debt move − debt after the row before = interest since
//     collateral after − collateral move − collateral after the row before
//                                                        = what the AMM sold
//                                                          (or bought back)
//                                                          in the bands since
//
// The debt's gap is the Controller's interest to the base unit (never below
// zero on victoria, 1 Oct 2026). The collateral's is soft liquidation: as the
// oracle price falls through the bands the AMM sells collateral for the
// borrowed token, and buys it back as the price rises. A gap within the AMM's
// rounding (1,000 base units, or a millionth of the balance) stays inside the
// row's act.
//
// Two rows state no after-image: an underwater partial repay (the Controller
// logs a sentinel collateral, which the index drops) and a partial
// liquidation (no UserState at all). Their balances are read from the archive
// at the row's block (`user_state`, /api/chain/llamalend/event-state, the
// read the card's detail makes), where the row is the position's last in its
// block, up to LLAMALEND_STATE_READS rows. A row still unstated keeps the
// collateral as it stood, or lowers each side by its amounts, and the
// next row that states its balances settles both.
//
// The bars count the collateral token in the bands. What the AMM sold it for
// (the borrowed token it holds for the position, "converted") is a state read
// that no row records, so it is not on the bars; the position card states it
// live.
//
// Prices. The rows carry none: each row's block is read from the archive
// (the AMM's price_oracle at the block, /api/chain/llamalend/liq-price), up
// to LLAMALEND_PRICE_READS blocks a position; a row not read takes the
// nearest priced moment in time (a read row, or today's live read). LlamaLend
// is not in the daily price store, so between events the collateral keeps its
// latest event's price.
//
// Between events the debt grows at the rate the rows imply
// (`FlowTimeline.indexes`, basis `llamalend-rows`): from one row to the next
// at the rate the next row's interest gives (simple), and after the last row
// at the rate that meets today's live read.
//
// Pure: tested offline in scripts/verify/verify-llamalend-flows.ts.

import type { FlowBucket, FlowDayRow, FlowEvent, FlowIndexes, FlowTimeline } from "@/lib/shared/flows-timeline";
import { daysFromEvents, unitScaleFor } from "@/lib/shared/flows-timeline";
import type { FocusEvent } from "@/lib/shared/flow-focus";
import type { BaseActivityEvent, LlamalendContext, LlamalendEventType } from "@/lib/shared/types/event-shape";
import { isLlamalendEvent } from "@/lib/shared/types/event-shape";

const DAY_S = 86_400;
const ONE_YEAR_S = 31_557_600;
const DUST = 1e-12;
const ZERO = BigInt(0);

/** At most this many blocks' price reads per position; the rest take the
 *  nearest priced moment, and the Explanation counts them. */
export const LLAMALEND_PRICE_READS = 250;
/** At most this many unstated rows' balances read per position. */
export const LLAMALEND_STATE_READS = 100;

/** Bucket keys. */
export const LL = {
  collIn: "ll-coll-in",
  boughtBack: "ll-bought-back",
  collOut: "ll-coll-out",
  softSold: "ll-soft-sold",
  collSeized: "ll-coll-seized",
  borrowed: "ll-borrowed",
  accrued: "ll-accrued",
  repaid: "ll-repaid",
  debtLiquidated: "ll-debt-liquidated",
} as const;

const COLL_KEYS = new Set<string>([LL.collIn, LL.boughtBack, LL.collOut, LL.softSold, LL.collSeized]);
const OUT_KEYS = new Set<string>([LL.collOut, LL.softSold, LL.collSeized, LL.repaid, LL.debtLiquidated]);
/** Legs that are no act of the row's: the interest and the AMM's trades
 *  since the row before. */
const BETWEEN_KEYS = new Set<string>([LL.accrued, LL.softSold, LL.boughtBack]);

/** The buckets in drawing order. */
export function llamalendFlowBuckets(): FlowBucket[] {
  return [
    { key: LL.collIn, label: "Deposited", event: "Add collateral", side: "collateral", dir: "in" },
    // What the AMM bought back in the bands: the collateral token swapped in.
    {
      key: LL.boughtBack,
      label: "Bought back in soft liquidation",
      event: "",
      side: "collateral",
      dir: "in",
      hatch: "checker",
    },
    { key: LL.collOut, label: "Withdrawn", event: "Remove collateral", side: "collateral", dir: "out" },
    // Swapped within the position: the AMM sold it for the borrowed token,
    // which stays in the bands.
    {
      key: LL.softSold,
      label: "Sold in soft liquidation",
      event: "",
      side: "collateral",
      dir: "out",
      hatch: "vertical",
    },
    {
      key: LL.collSeized,
      label: "Seized in liquidations",
      event: "Liquidation",
      side: "collateral",
      dir: "out",
      tone: "liquidation",
      hatch: "forward",
      link: "liquidation",
    },
    { key: LL.borrowed, label: "Borrowed", event: "Borrow", side: "debt", dir: "in" },
    // Interest is dashed (rails-ops reference/lifetime-flows-scrubber.md): it
    // moves on most events, so no event's name is its own.
    { key: LL.accrued, label: "Interest accrued", event: "", side: "debt", dir: "in", hatch: "dashes" },
    { key: LL.repaid, label: "Repaid", event: "Repay", side: "debt", dir: "out" },
    {
      key: LL.debtLiquidated,
      label: "Cleared by liquidations",
      event: "Liquidation",
      side: "debt",
      dir: "out",
      tone: "liquidation",
      hatch: "forward",
      link: "liquidation",
    },
  ];
}

/** One row of the position's history, in base units. */
export interface LlamalendFlowEvent {
  id: string;
  /** Unix seconds. */
  ts: number;
  block: number;
  tx?: string;
  kind: LlamalendEventType;
  /** A liquidation the borrower made of their own position: a close. */
  self: boolean;
  /** The row's signed moves (collateral in the collateral token, debt in
   *  the borrowed token), base units. */
  collDelta: bigint;
  debtDelta: bigint;
  /** A liquidation's converted borrowed token taken from the bands. */
  convertedTaken: bigint;
  /** The after-image, where the row states it or the archive read it. */
  collAfter: bigint | null;
  debtAfter: bigint | null;
  /** The row states no after-image; `collAfter` and `debtAfter` are the
   *  archive's read at its block, where there is one. */
  read: boolean;
  collDecimals: number;
  debtDecimals: number;
  /** The AMM's oracle price at the row's block (borrowed per collateral),
   *  where it was read. */
  price: number | null;
}

const big = (v: string | undefined | null): bigint | null => {
  if (v == null || v === "") return null;
  try {
    return BigInt(v);
  } catch {
    return null;
  }
};

/** The position at the end of a block, read from the archive: collateral in
 *  the bands and debt, base units (0 and 0 where it had no loan). */
export interface LlamalendStateRead {
  coll: bigint;
  debt: bigint;
}

/** The page's rows as the replay reads them, oldest first: the borrower's
 *  rows (a row where the page's wallet liquidated someone else's position is
 *  not this position's), each with the price read at its block, and a row
 *  with no after-image given the archive's read at its block where it is the
 *  position's last row in that block. */
export function llamalendFlowEvents(
  events: BaseActivityEvent[],
  prices?: Map<number, number> | null,
  states?: Map<number, LlamalendStateRead> | null,
): LlamalendFlowEvent[] {
  const rows = events
    .filter(isLlamalendEvent)
    .filter((e) => (e.context.data as LlamalendContext).role !== "liquidator")
    .slice()
    .sort((a, b) => a.blockNumber - b.blockNumber || a.timestamp - b.timestamp);
  // A stable sort keeps the served order inside a block (the log order).
  return rows.map((e, i) => {
    const c = e.context.data as LlamalendContext;
    const p = prices?.get(e.blockNumber);
    const collAfter = big(c.raw?.collateralAfter);
    const debtAfter = big(c.raw?.debtAfter);
    const unstated = collAfter == null || debtAfter == null;
    const lastInBlock = rows[i + 1]?.blockNumber !== e.blockNumber;
    const st = unstated && lastInBlock ? states?.get(e.blockNumber) : undefined;
    return {
      id: e.id,
      ts: e.timestamp,
      block: e.blockNumber,
      tx: e.txHash || undefined,
      kind: c.eventType,
      self: c.eventType === "liquidation" && (c.role === "self" || c.selfLiquidation === true),
      collDelta: big(c.raw?.collateralDelta) ?? ZERO,
      debtDelta: big(c.raw?.debtDelta) ?? ZERO,
      convertedTaken: big(c.raw?.convertedTaken) ?? ZERO,
      collAfter: collAfter ?? st?.coll ?? null,
      debtAfter: debtAfter ?? st?.debt ?? null,
      read: st != null,
      collDecimals: c.collateralDecimals,
      debtDecimals: c.borrowedDecimals,
      price: p != null && p > 0 ? p : null,
    };
  });
}

/** The blocks whose price the replay reads, newest first, at most `cap`. */
export function llamalendPriceBlocks(events: LlamalendFlowEvent[], cap = LLAMALEND_PRICE_READS): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (let i = events.length - 1; i >= 0 && out.length < cap; i--) {
    const b = events[i].block;
    if (seen.has(b)) continue;
    seen.add(b);
    out.push(b);
  }
  return out;
}

/** The blocks whose position the replay reads: each row with no after-image
 *  that is the position's last row in its block, at most `cap`. */
export function llamalendStateBlocks(events: LlamalendFlowEvent[], cap = LLAMALEND_STATE_READS): number[] {
  const out: number[] = [];
  for (let i = 0; i < events.length && out.length < cap; i++) {
    const e = events[i];
    if (e.collAfter != null && e.debtAfter != null) continue;
    if (events[i + 1]?.block === e.block) continue;
    out.push(e.block);
  }
  return out;
}

/** Where a row's price came from: its block's read, the nearest read row's,
 *  or today's live read. */
export type LlamalendPriceFrom = "row" | "nearest" | "today";

/** A replayed row's legs in tokens, by bucket. */
export interface LlamalendReplayed {
  ev: LlamalendFlowEvent;
  price: number;
  priceFrom: LlamalendPriceFrom;
  legs: { bucket: string; amount: number }[];
  /** Balances after the row, tokens; whether the row stated each. */
  coll: number;
  debt: number;
  collStated: boolean;
  debtStated: boolean;
}

const human = (v: bigint, decimals: number): number => Number(v) / 10 ** decimals;

/** The per-row replay. `livePrice` (today's oracle, borrowed per collateral)
 *  is the nearest price for rows nearer today than any read row. */
export function replayLlamalend(
  events: LlamalendFlowEvent[],
  livePrice: number | null,
  now: number,
): LlamalendReplayed[] {
  const priced = events.filter((e) => e.price != null);
  let pi = 0;
  const nearest = (ts: number): { price: number; from: LlamalendPriceFrom } => {
    while (pi + 1 < priced.length && priced[pi + 1].ts <= ts) pi++;
    const cands: { dt: number; price: number; from: LlamalendPriceFrom }[] = [];
    const a = priced[pi];
    const b = priced[pi + 1];
    if (a) cands.push({ dt: Math.abs(a.ts - ts), price: a.price as number, from: "nearest" });
    if (b) cands.push({ dt: Math.abs(b.ts - ts), price: b.price as number, from: "nearest" });
    if (livePrice != null && livePrice > 0) cands.push({ dt: Math.abs(now - ts), price: livePrice, from: "today" });
    cands.sort((x, y) => x.dt - y.dt);
    return cands[0] ?? { price: 0, from: "nearest" };
  };
  let coll = ZERO;
  let debt = ZERO;
  const out: LlamalendReplayed[] = [];
  for (const ev of events) {
    const cd = ev.collDecimals;
    const dd = ev.debtDecimals;
    const legs: { bucket: string; amount: number }[] = [];
    const add = (bucket: string, raw: bigint, decimals: number) => {
      if (raw <= ZERO) return;
      const amount = human(raw, decimals);
      if (amount > DUST) legs.push({ bucket, amount });
    };
    const liq = ev.kind === "liquidation";
    const taken = liq && !ev.self;

    // Debt: the interest since the row before, then the act.
    let debtAfter: bigint;
    if (ev.debtAfter != null) {
      const gap = ev.debtAfter - ev.debtDelta - debt;
      const interest = gap > ZERO ? gap : ZERO;
      add(LL.accrued, interest, dd);
      const act = ev.debtAfter - debt - interest;
      if (act > ZERO) add(LL.borrowed, act, dd);
      else add(taken ? LL.debtLiquidated : LL.repaid, -act, dd);
      debtAfter = ev.debtAfter;
    } else {
      // A partial liquidation: the debt falls by what it cleared; the interest
      // since the row before lands on the next row that states the debt.
      let after = debt + ev.debtDelta;
      if (after < ZERO) {
        add(LL.accrued, -after, dd);
        after = ZERO;
      }
      if (ev.debtDelta > ZERO) add(LL.borrowed, ev.debtDelta, dd);
      else add(taken ? LL.debtLiquidated : LL.repaid, -ev.debtDelta, dd);
      debtAfter = after;
    }

    // Collateral: what the AMM sold or bought back since the row before, then
    // the act.
    let collAfter: bigint;
    if (ev.collAfter != null) {
      const gap = ev.collAfter - ev.collDelta - coll;
      const tol = BigInt(1000) > coll / BigInt(1_000_000) ? BigInt(1000) : coll / BigInt(1_000_000);
      const traded = gap < -tol || gap > tol;
      if (traded && gap < ZERO) add(LL.softSold, -gap, cd);
      if (traded && gap > ZERO) add(LL.boughtBack, gap, cd);
      const act = ev.collAfter - coll - (traded ? gap : ZERO);
      if (act > ZERO) add(LL.collIn, act, cd);
      else add(taken ? LL.collSeized : LL.collOut, -act, cd);
      collAfter = ev.collAfter;
    } else {
      // Unstated: an underwater partial repay (no move) or a partial
      // liquidation (the collateral it took).
      let after = coll + ev.collDelta;
      if (after < ZERO) after = ZERO;
      const act = after - coll;
      if (act > ZERO) add(LL.collIn, act, cd);
      else add(taken ? LL.collSeized : LL.collOut, -act, cd);
      collAfter = after;
    }

    const p = ev.price != null ? { price: ev.price, from: "row" as const } : nearest(ev.ts);
    out.push({
      ev,
      price: p.price,
      priceFrom: p.from,
      legs,
      coll: human(collAfter, cd),
      debt: human(debtAfter, dd),
      collStated: ev.collAfter != null,
      debtStated: ev.debtAfter != null,
    });
    coll = collAfter;
    debt = debtAfter;
  }
  return out;
}

/** What the page's live read states now, where it has one. */
export interface LlamalendLive {
  /** The AMM's oracle now, borrowed per collateral. */
  price: number | null;
  /** The collateral in the bands and the debt now, tokens. */
  coll?: number | null;
  debt?: number | null;
}

export interface LlamalendFlowOptions {
  collSymbol: string;
  debtSymbol: string;
  /** Unix seconds now; the page's clock. */
  now: number;
  /** The position is open (the page's verdict). */
  open: boolean;
  live: LlamalendLive | null;
}

/** The replay with the debt's rates between rows, for the timeline, the
 *  cards and the tests. */
export interface LlamalendFlowReplay {
  replayed: LlamalendReplayed[];
  /** Per row, the debt's rate (fraction a year) from that row to the next;
   *  the last row's the rate that meets today's live debt. */
  borrowRate: number[];
  /** Per row, the debt's growth index the rows imply: 1 at the first row. */
  borrowIndex: number[];
  /** Grains per token of the unit: the model's figures are the unit × this. */
  grain: number;
  scale: number;
}

const legOf = (r: LlamalendReplayed, k: string) => r.legs.find((l) => l.bucket === k)?.amount ?? 0;

export function llamalendFlowReplay(events: LlamalendFlowEvent[], o: LlamalendFlowOptions): LlamalendFlowReplay {
  const livePrice = o.live?.price != null && o.live.price > 0 ? o.live.price : null;
  const replayed = replayLlamalend(events, livePrice, o.now);
  const borrowRate: number[] = [];
  const borrowIndex: number[] = [];
  let bi = 1;
  for (let i = 0; i < replayed.length; i++) {
    const r = replayed[i];
    const prev = replayed[i - 1];
    if (prev && prev.debt > DUST) bi *= 1 + legOf(r, LL.accrued) / prev.debt;
    borrowIndex.push(bi);
    const next = replayed[i + 1];
    if (!next) {
      // After the last row: the rate that brings its debt to today's live read.
      const liveDebt = o.open ? o.live?.debt : null;
      const dt = o.now - r.ev.ts;
      borrowRate.push(
        liveDebt != null && r.debt > DUST && dt > 0 && liveDebt >= r.debt
          ? (liveDebt / r.debt - 1) / (dt / ONE_YEAR_S)
          : (borrowRate[i - 1] ?? 0),
      );
      continue;
    }
    const dt = next.ev.ts - r.ev.ts;
    // A gap with no time (two rows in one block) keeps the rate before it.
    borrowRate.push(
      dt > 0 && r.debt > DUST ? legOf(next, LL.accrued) / r.debt / (dt / ONE_YEAR_S) : (borrowRate[i - 1] ?? 0),
    );
  }
  // The scale: about five significant digits of the largest figure the bars
  // can reach, in the borrowed token.
  let peak = 0;
  let inColl = 0;
  let inDebt = 0;
  for (const r of replayed) {
    for (const l of r.legs) {
      if (OUT_KEYS.has(l.bucket)) continue;
      if (COLL_KEYS.has(l.bucket)) inColl += l.amount * r.price;
      else inDebt += l.amount;
    }
    peak = Math.max(peak, inColl, inDebt, r.coll * r.price, r.debt);
  }
  const scale = unitScaleFor(peak);
  return { replayed, borrowRate, borrowIndex, grain: 10 ** scale, scale };
}

/** The growth factor of a balance `dt` seconds after its row, at `rate`. */
const grow = (rate: number, dt: number) => 1 + rate * (Math.max(0, dt) / ONE_YEAR_S);

const COLL = "coll";
const DEBT = "debt";

/** Whether a balance moved by more than the AMM's rounding. */
const tolOf = (amount: number, decimals: number) => Math.max(1000 / 10 ** decimals, amount * 1e-6);

/** The position's rows as the Lifetime flows panel's timeline, in the
 *  borrowed token. Null with no rows, or where the collateral has no price
 *  at all. */
export function llamalendFlowTimeline(events: LlamalendFlowEvent[], o: LlamalendFlowOptions): FlowTimeline | null {
  if (events.length === 0) return null;
  const rp = llamalendFlowReplay(events, o);
  const { replayed, grain: G, scale } = rp;
  if (!replayed.some((r) => r.price > 0)) return null;
  const cp = (r: LlamalendReplayed) => r.price * G;
  const buckets = llamalendFlowBuckets();
  const flowEvents: FlowEvent[] = replayed.map((r, i) => {
    const moved = { coll: false, debt: false };
    for (const l of r.legs) {
      if (BETWEEN_KEYS.has(l.bucket)) continue;
      if (COLL_KEYS.has(l.bucket)) moved.coll = true;
      else moved.debt = true;
    }
    const liq = r.ev.kind === "liquidation" && !r.ev.self;
    return {
      id: r.ev.id,
      ts: r.ev.ts,
      block: r.ev.block,
      tick: liq ? "liquidation" : moved.coll && moved.debt ? "both" : moved.debt ? "debt" : "collateral",
      legs: r.legs.map((l) =>
        COLL_KEYS.has(l.bucket)
          ? { bucket: l.bucket, usd: l.amount * cp(r), symbol: o.collSymbol }
          : { bucket: l.bucket, usd: l.amount * G, symbol: o.debtSymbol },
      ),
      tx: r.ev.tx,
      countsTx: !liq,
      balances: [
        { asset: COLL, symbol: o.collSymbol, side: "collateral", amount: Math.max(0, r.coll) },
        { asset: DEBT, symbol: o.debtSymbol, side: "debt", amount: Math.max(0, r.debt), index: rp.borrowIndex[i] },
      ],
      // Every row states the price its collateral flows were valued at (its
      // own, or the nearest), so a card and the bars agree on its day.
      prices: [
        { asset: COLL, usd: cp(r) },
        { asset: DEBT, usd: G },
      ],
    };
  });
  const days: FlowDayRow[] = daysFromEvents(
    buckets.map((b) => b.key),
    flowEvents,
  );

  const today = Math.floor(o.now / DAY_S);
  const li = replayed.length - 1;
  const last = replayed[li];
  const open = o.open && (last.coll > DUST || last.debt > DUST);
  const livePrice = o.live?.price != null && o.live.price > 0 ? o.live.price : null;
  const firstDay = Math.floor(replayed[0].ev.ts / DAY_S);
  const endDay = open ? Math.max(today, Math.floor(last.ev.ts / DAY_S) + 1) : Math.floor(last.ev.ts / DAY_S) + 1;

  // Now: the live read where the page has one, else the last row (its debt
  // grown at the last rate).
  const sinceLast = o.now - last.ev.ts;
  const nowColl = open ? (o.live?.coll ?? last.coll) : 0;
  const nowDebt = open ? (o.live?.debt ?? last.debt * grow(rp.borrowRate[li], sinceLast)) : 0;
  const priceNow = (livePrice ?? last.price) * G;

  // What the AMM sold or bought back since the last row, from the live read:
  // added to its line at the live stop.
  const pending: NonNullable<FlowTimeline["live"]["pending"]> = [];
  if (open && o.live?.coll != null) {
    const gap = o.live.coll - last.coll;
    if (Math.abs(gap) > tolOf(last.coll, last.ev.collDecimals))
      pending.push({
        bucket: gap < 0 ? LL.softSold : LL.boughtBack,
        symbol: o.collSymbol,
        usd: Math.abs(gap) * priceNow,
      });
  }

  // The collateral's price: each event day the price its flows were valued
  // at, carried between, and today's.
  const collObs = new Map<number, number>();
  for (const r of replayed) collObs.set(Math.floor(r.ev.ts / DAY_S), cp(r));
  if (livePrice != null && open) collObs.set(today, livePrice * G);
  // The debt's growth index at each day's close: the last row's, grown at the
  // rate since to the day's end; today's meets the live read.
  const borrowRows: [number, number | null, number | null][] = [];
  const unitObs: [number, number][] = [];
  let ei = -1;
  for (let d = firstDay; d <= endDay; d++) {
    unitObs.push([d, G]);
    const end = Math.min((d + 1) * DAY_S, o.now);
    while (ei + 1 < replayed.length && replayed[ei + 1].ev.ts <= end) ei++;
    if (ei < 0) continue;
    const r = replayed[ei];
    const isNow = d === today && open && ei === li;
    borrowRows.push([
      d,
      null,
      rp.borrowIndex[ei] * (isNow && r.debt > DUST ? nowDebt / r.debt : grow(rp.borrowRate[ei], end - r.ev.ts)),
    ]);
  }
  const indexes: FlowIndexes = { basis: "llamalend-rows", assets: { [DEBT]: borrowRows } };

  const assets: NonNullable<FlowTimeline["live"]["assets"]> = [];
  if (open) {
    if (nowColl > DUST)
      assets.push({ side: "collateral", symbol: o.collSymbol, amount: nowColl, usd: nowColl * priceNow });
    if (nowDebt > DUST) assets.push({ side: "debt", symbol: o.debtSymbol, amount: nowDebt, usd: nowDebt * G });
  }

  return {
    unit: { symbol: o.debtSymbol, scale },
    buckets,
    days,
    live: {
      collateralUsd: open ? nowColl * priceNow : 0,
      debtUsd: open ? nowDebt * G : 0,
      assets,
      ...(pending.length > 0 ? { pending } : {}),
    },
    todayPrices: { [COLL]: priceNow, [DEBT]: G },
    dailyPrices: { [COLL]: [...collObs].sort((a, b) => a[0] - b[0]), [DEBT]: unitObs },
    seriesCarry: true,
    indexes,
    today: open ? today : endDay,
    labels: { collateral: "Collateral", debt: "Debt" },
    words: llamalendFlowWords(o.collSymbol, o.debtSymbol),
  };
}

/** The panel's words for a LlamaLend position. */
export function llamalendFlowWords(collSymbol: string, debtSymbol: string): NonNullable<FlowTimeline["words"]> {
  return {
    held: "Still in the bands",
    restBySide: {
      collateral: "Market move since the last event",
      debt: "Interest since the last event",
    },
    restNote: {
      collateral: `the change in ${collSymbol}'s oracle price, in ${debtSymbol}, since each flow`,
      debt: "the interest built up on the debt at the market's rate since the position's last event",
    },
    basis: {
      collateral: `Every figure is in ${debtSymbol}, the market's borrowed token; each ${collSymbol} flow is converted at the market's oracle price at its block where it was read, else at the nearest one read.`,
      debt: `Every figure is in ${debtSymbol}, the market's borrowed token.`,
    },
    heldBasis: {
      collateral: `the ${collSymbol} in the bands after the last event, at the oracle price of the latest event that priced it, in ${debtSymbol}.`,
      debt: `the ${debtSymbol} owed after the last event, grown at the rate the market charged until its next event (after the last, the rate that meets today's debt).`,
    },
    linePrices: `in ${debtSymbol}, with the collateral at the oracle price of its latest priced event and the debt grown at the market's rate since the last event`,
    moment: {
      noPrice: {
        collateral: `No oracle price is recorded for this day, so the ${collSymbol} is stated in tokens.`,
      },
      notes: [
        `The collateral is the ${collSymbol} in the bands. What the AMM sold of it is held as ${debtSymbol} in the bands, which no event records, so it is not counted here.`,
      ],
    },
  };
}

/** The rows as the event cards' sums read them (lib/shared/flow-focus.ts):
 *  each row's legs in the model's figures (the unit in grains) and in
 *  tokens. Each side's figure just before and once the row's transaction had
 *  run is the transaction's last row's balance at that row's price, less the
 *  transaction's acts. */
export function llamalendFocusEvents(rp: LlamalendFlowReplay, collSymbol: string, debtSymbol: string): FocusEvent[] {
  const { replayed, grain: G } = rp;
  const cp = (r: LlamalendReplayed) => r.price * G;
  const byTx = new Map<string, LlamalendReplayed[]>();
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
        if (BETWEEN_KEYS.has(l.bucket)) continue;
        const sign = OUT_KEYS.has(l.bucket) ? -1 : 1;
        if (COLL_KEYS.has(l.bucket)) collMove += sign * l.amount;
        else debtMove += sign * l.amount;
      }
    const collHeld = Math.max(0, lastOf.coll);
    const debtHeld = Math.max(0, lastOf.debt);
    const collPrice = cp(lastOf);
    return {
      id: r.ev.id,
      ts: r.ev.ts,
      ...(r.ev.tx ? { tx: r.ev.tx } : {}),
      legs: r.legs.map((l) =>
        COLL_KEYS.has(l.bucket)
          ? {
              bucket: l.bucket,
              usd: l.amount * cp(r),
              amount: l.amount,
              symbol: collSymbol,
              ...(BETWEEN_KEYS.has(l.bucket) ? { accrual: true } : {}),
            }
          : {
              bucket: l.bucket,
              usd: l.amount * G,
              amount: l.amount,
              symbol: debtSymbol,
              ...(BETWEEN_KEYS.has(l.bucket) ? { accrual: true } : {}),
            },
      ),
      sides: {
        collateral: {
          before: Math.max(0, collHeld - collMove) * collPrice,
          after: collHeld * collPrice,
          amount: collMove,
          symbol: collSymbol,
          held: collHeld,
        },
        debt: {
          before: Math.max(0, debtHeld - debtMove) * G,
          after: debtHeld * G,
          amount: debtMove,
          symbol: debtSymbol,
          held: debtHeld,
        },
      },
      rate: rp.borrowRate[i] * 100,
    };
  });
}

/** What the Explanation counts. */
export interface LlamalendFlowFacts {
  /** Rows valued at their block's oracle price, at the nearest read
   *  row's, and at today's live read. */
  pricing: { row: number; nearest: number; today: number };
  /** Rows before which the AMM had sold collateral, or bought it back. */
  softSold: number;
  boughtBack: number;
  /** Sold or bought back since the last event, by the live read. */
  softSinceLast: "sold" | "bought" | null;
  liquidations: number;
  partialLiquidations: number;
  selfLiquidations: number;
  /** Underwater partial repays: rows with no after-image. */
  unstatedRepays: number;
  /** Rows with no after-image whose balances the archive read, and rows
   *  left unstated. */
  readRows: number;
  unstatedRows: number;
  /** Rows with interest since the row before. */
  accruedRows: number;
  /** Converted borrowed token taken by hard liquidations, tokens. */
  convertedTaken: number;
}

export function llamalendFlowFacts(rp: LlamalendFlowReplay, timeline: FlowTimeline | null): LlamalendFlowFacts {
  const pricing = { row: 0, nearest: 0, today: 0 };
  let convertedTaken = 0;
  for (const r of rp.replayed) {
    pricing[r.priceFrom]++;
    if (r.ev.kind === "liquidation" && !r.ev.self) convertedTaken += human(r.ev.convertedTaken, r.ev.debtDecimals);
  }
  const has = (k: string) => rp.replayed.filter((r) => r.legs.some((l) => l.bucket === k)).length;
  const pend = timeline?.live.pending?.[0]?.bucket;
  const liq = rp.replayed.filter((r) => r.ev.kind === "liquidation");
  return {
    pricing,
    softSold: has(LL.softSold),
    boughtBack: has(LL.boughtBack),
    softSinceLast: pend === LL.softSold ? "sold" : pend === LL.boughtBack ? "bought" : null,
    liquidations: liq.filter((r) => !r.ev.self).length,
    partialLiquidations: liq.filter((r) => !r.ev.self && (!r.debtStated || r.ev.read)).length,
    selfLiquidations: liq.filter((r) => r.ev.self).length,
    unstatedRepays: rp.replayed.filter((r) => r.ev.kind === "repay" && (!r.collStated || r.ev.read)).length,
    readRows: rp.replayed.filter((r) => r.ev.read).length,
    unstatedRows: rp.replayed.filter((r) => !r.collStated || !r.debtStated).length,
    accruedRows: has(LL.accrued),
    convertedTaken,
  };
}
