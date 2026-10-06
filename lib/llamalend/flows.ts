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
// liquidation (no UserState at all). Their balances are the position at the
// end of the row's block (`user_state`), where the row is the position's last
// in its block: stored by the server (rails-server mig 373, served on each
// row of the timeline route), else read from the archive per page view
// (/api/chain/llamalend/event-state, the read the card's detail makes), up to
// LLAMALEND_STATE_READS rows. A row still unstated keeps the collateral as it
// stood, or lowers each side by its amounts, and the next row that states its
// balances settles both.
//
// The borrowed token in the bands. What the AMM sold collateral for, it holds
// for the position in the bands ("converted", user_state's second word), and
// no event records it. Where the server stored the position's state at the
// rows' blocks, it is a second asset on the collateral side, in the borrowed
// token: what it took in for its sales since the row before is Received in
// soft liquidation, what it spent buying back is Spent in soft liquidation,
// what a hard liquidation took with the collateral is Seized, and what a
// close handed back is Withdrawn. A repay that closes the position logs the
// collateral it handed back and not the borrowed token: the server stores the
// position one block before the repay, and that balance is what the close
// handed back; where it has not, the AMM's trades since the row before are
// valued at the row's price. With nothing stored, the bars count the
// collateral token alone, as before the store.
//
// Prices. The rows carry none: each row's block is priced at the AMM's
// price_oracle there, stored by the server, else read from the archive per
// page view (/api/chain/llamalend/liq-price), up to LLAMALEND_PRICE_READS
// blocks a position; a row with neither takes the nearest priced moment in
// time (a priced row, or today's live read). LlamaLend is not in the daily
// price store, so between events the collateral keeps its latest event's
// price.
//
// Between events the debt grows at the rate the rows imply
// (`FlowTimeline.indexes`, basis `llamalend-rows`): from one row to the next
// at the rate the next row's interest gives (simple), and after the last row
// at the rate that meets today's live read.
//
// Pure: tested offline in scripts/verify/verify-llamalend-flows.ts.

import type {
  FlowBucket,
  FlowDayRow,
  FlowEvent,
  FlowIndexes,
  FlowTimeline,
  FlowUnsure,
} from "@/lib/shared/flows-timeline";
import { daysFromEvents, unitScaleFor } from "@/lib/shared/flows-timeline";
import type { FocusEvent } from "@/lib/shared/flow-focus";
import type { BaseActivityEvent, LlamalendContext, LlamalendEventType } from "@/lib/shared/types/event-shape";
import { isLlamalendEvent } from "@/lib/shared/types/event-shape";
import { scale1e18 } from "@/lib/llamalend/band-math";

const DAY_S = 86_400;
const ONE_YEAR_S = 31_557_600;
const DUST = 1e-12;
const ZERO = BigInt(0);

/** At most this many blocks' price reads per position, among the rows the
 *  server has not stored; the rest take the nearest priced moment, and the
 *  Explanation counts them. */
export const LLAMALEND_PRICE_READS = 250;
/** At most this many unstated rows' balances read per position, among the
 *  rows the server has not stored. */
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
  softReceived: "ll-soft-received",
  softSpent: "ll-soft-spent",
} as const;

const COLL_KEYS = new Set<string>([
  LL.collIn,
  LL.boughtBack,
  LL.softReceived,
  LL.collOut,
  LL.softSold,
  LL.softSpent,
  LL.collSeized,
]);
const OUT_KEYS = new Set<string>([LL.collOut, LL.softSold, LL.softSpent, LL.collSeized, LL.repaid, LL.debtLiquidated]);
/** Legs that are no act of the row's: the interest and the AMM's trades
 *  since the row before. */
const BETWEEN_KEYS = new Set<string>([LL.accrued, LL.softSold, LL.boughtBack, LL.softReceived, LL.softSpent]);

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
      link: "ll-soft-buy",
    },
    // The borrowed token the AMM took in for its sales, held in the bands.
    // Dashed: it builds between events, as interest does.
    {
      key: LL.softReceived,
      label: "Received in soft liquidation",
      event: "",
      side: "collateral",
      dir: "in",
      hatch: "dashes",
      link: "ll-soft-sale",
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
      link: "ll-soft-sale",
    },
    // The borrowed token the AMM paid out of the bands for its buy-backs.
    {
      key: LL.softSpent,
      label: "Spent in soft liquidation",
      event: "",
      side: "collateral",
      dir: "out",
      hatch: "horizontal",
      link: "ll-soft-buy",
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
   *  where the server stored it or the page read it. */
  price: number | null;
  /** The borrowed token the AMM holds in the position's bands after the
   *  row, base units: the server's stored user_state at the row's block,
   *  where the row is the position's last in it; else null. */
  convAfter: bigint | null;
  /** The server stored the position's state at the row's block (rails-server
   *  mig 373). */
  stored: boolean;
  /** A repay that closes the position: the server's stored state at the end
   *  of the block before (collateral and borrowed token in the bands, base
   *  units), where the filler has read it; else null. */
  before: { coll: bigint; conv: bigint } | null;
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
 *  not this position's), each with the price at its block (the server's
 *  stored price, else the page's read), and a row with no after-image given
 *  the position at the end of its block (the server's stored state, else the
 *  page's read) where it is the position's last row in that block. */
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
    const storedPriceRaw = big(c.raw?.priceAtBlock);
    const storedPrice = storedPriceRaw != null && storedPriceRaw > ZERO ? scale1e18(storedPriceRaw) : null;
    const p = storedPrice ?? prices?.get(e.blockNumber);
    const collAfter = big(c.raw?.collateralAfter);
    const debtAfter = big(c.raw?.debtAfter);
    const unstated = collAfter == null || debtAfter == null;
    const lastInBlock = rows[i + 1]?.blockNumber !== e.blockNumber;
    // The server's state at the block: a position with no loan there holds
    // nothing (its stale words read as zero), as the page's read takes it.
    const sColl = big(c.raw?.stateCollateralAtBlock);
    const sConv = big(c.raw?.stateBorrowedAtBlock);
    const sDebt = big(c.raw?.stateDebtAtBlock);
    const stored = sColl != null && sConv != null && sDebt != null;
    const storedState: LlamalendStateRead | null = stored
      ? sDebt > ZERO
        ? { coll: sColl, debt: sDebt }
        : { coll: ZERO, debt: ZERO }
      : null;
    const st = unstated && lastInBlock ? (storedState ?? states?.get(e.blockNumber)) : undefined;
    const bColl = big(c.raw?.stateCollateralBefore);
    const bConv = big(c.raw?.stateBorrowedBefore);
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
      convAfter: stored && lastInBlock ? (sDebt > ZERO ? sConv : ZERO) : null,
      stored,
      before: bColl != null && bConv != null ? { coll: bColl, conv: bConv } : null,
    };
  });
}

/** The blocks whose price the page reads, newest first, at most `cap`: the
 *  rows the server has not priced. */
export function llamalendPriceBlocks(events: LlamalendFlowEvent[], cap = LLAMALEND_PRICE_READS): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (let i = events.length - 1; i >= 0 && out.length < cap; i--) {
    if (events[i].price != null) continue;
    const b = events[i].block;
    if (seen.has(b)) continue;
    seen.add(b);
    out.push(b);
  }
  return out;
}

/** The blocks whose position the page reads: each row with no after-image
 *  that is the position's last row in its block and whose state the server
 *  has not stored, at most `cap`. */
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

/** Where a row's price came from: its block's price (stored or read), the
 *  nearest priced row's, or today's live read. */
export type LlamalendPriceFrom = "row" | "nearest" | "today";

/** One leg of a replayed row, in tokens: the collateral token, the borrowed
 *  token on the debt side, or (`conv`) the borrowed token in the bands. */
export interface LlamalendLeg {
  bucket: string;
  amount: number;
  conv?: true;
}

/** A replayed row's legs in tokens, by bucket. */
export interface LlamalendReplayed {
  ev: LlamalendFlowEvent;
  price: number;
  priceFrom: LlamalendPriceFrom;
  legs: LlamalendLeg[];
  /** Balances after the row, tokens; whether the row stated each. */
  coll: number;
  debt: number;
  collStated: boolean;
  debtStated: boolean;
  /** The borrowed token the AMM holds in the bands after the row, tokens:
   *  the stored state, else carried from the row before less what the row
   *  took (0 where nothing is stored for the position). */
  conv: number;
  /** The store has not reached the row while the AMM was trading the bands:
   *  its converted balance is carried from the row before, and the next
   *  stored row settles it. */
  convUnread: boolean;
  /** The row closed the position by a repay after the AMM traded since the
   *  row before, and the server has not stored the position a block before
   *  it: what it took in for those trades is valued at the row's price, and
   *  the rest of what it held is Withdrawn. */
  convEstimated: boolean;
}

const human = (v: bigint, decimals: number): number => Number(v) / 10 ** decimals;

/** Whether any row has the server's stored converted balance: the bars then
 *  carry the borrowed token in the bands. */
export const llamalendHasConv = (events: LlamalendFlowEvent[]) => events.some((e) => e.convAfter != null);

/** The per-row replay. `livePrice` (today's oracle, borrowed per collateral)
 *  is the nearest price for rows nearer today than any priced row. */
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
  const withConv = llamalendHasConv(events);
  let coll = ZERO;
  let debt = ZERO;
  let conv = ZERO;
  const out: LlamalendReplayed[] = [];
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const cd = ev.collDecimals;
    const dd = ev.debtDecimals;
    const legs: LlamalendLeg[] = [];
    const add = (bucket: string, raw: bigint, decimals: number, inBands = false) => {
      if (raw <= ZERO) return;
      const amount = human(raw, decimals);
      if (amount > DUST) legs.push(inBands ? { bucket, amount, conv: true } : { bucket, amount });
    };
    const liq = ev.kind === "liquidation";
    const taken = liq && !ev.self;
    const p = ev.price != null ? { price: ev.price, from: "row" as const } : nearest(ev.ts);

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
    let collGap = ZERO;
    if (ev.collAfter != null) {
      const gap = ev.collAfter - ev.collDelta - coll;
      const tol = BigInt(1000) > coll / BigInt(1_000_000) ? BigInt(1000) : coll / BigInt(1_000_000);
      const traded = gap < -tol || gap > tol;
      if (traded) collGap = gap;
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

    // The borrowed token in the bands, where the server stored it: its move
    // since the row before less the row's act is what the AMM took in for its
    // sales (above zero) or spent on its buy-backs (below). A liquidation
    // takes what its log states (`convertedTaken`); a repay that closes the
    // position hands back what was there, which no log states: the server's
    // state a block before the repay, else an estimate.
    let convAfter = conv;
    let convUnread = false;
    let convEstimated = false;
    if (withConv) {
      const took = liq ? ev.convertedTaken : ZERO;
      const closes = debtAfter === ZERO && collAfter === ZERO;
      const known = ev.convAfter ?? (closes ? ZERO : null);
      if (known != null) {
        let trades: bigint;
        let handed: bigint;
        if (closes && !liq) {
          // The trades since the row before: none where the collateral did
          // not move. Else, where the server stored the position at the end
          // of the block before the repay (and no row of the position lies
          // in the repay's block before it), the borrowed token in the bands
          // there is what the repay handed back, and its move since the row
          // before is the trades. A trade inside the repay's block, before
          // it, shows as the collateral handed back differing from that
          // state's; it is valued at the row's price. With no such state,
          // the collateral's whole trade is valued at the row's price.
          trades = ZERO;
          const pre = ev.before != null && events[i - 1]?.block !== ev.block ? ev.before : null;
          if (collGap !== ZERO && pre != null) {
            trades = pre.conv - conv;
            const late = pre.coll - (collAfter - ev.collDelta);
            const tol = BigInt(1000) > pre.coll / BigInt(1_000_000) ? BigInt(1000) : pre.coll / BigInt(1_000_000);
            if ((late < -tol || late > tol) && p.price > 0) {
              convEstimated = true;
              trades += BigInt(Math.round(human(late, cd) * p.price * 10 ** dd));
            }
            if (conv + trades < ZERO) trades = -conv;
          } else if (collGap !== ZERO && p.price > 0) {
            convEstimated = true;
            trades = BigInt(Math.round(-human(collGap, cd) * p.price * 10 ** dd));
            if (conv + trades < ZERO) trades = -conv;
          }
          handed = conv + trades;
        } else {
          handed = took;
          trades = known - conv + took;
        }
        if (trades > ZERO) add(LL.softReceived, trades, dd, true);
        if (trades < ZERO) add(LL.softSpent, -trades, dd, true);
        add(taken ? LL.collSeized : LL.collOut, handed, dd, true);
        convAfter = known;
      } else {
        // Not stored: carried, less what the row took; the next stored row
        // settles it.
        const left = conv - took;
        convAfter = left > ZERO ? left : ZERO;
        add(taken ? LL.collSeized : LL.collOut, conv - convAfter, dd, true);
        const settled = events[i + 1]?.block === ev.block;
        convUnread = !settled && (convAfter > ZERO || collGap !== ZERO);
      }
    }

    out.push({
      ev,
      price: p.price,
      priceFrom: p.from,
      legs,
      coll: human(collAfter, cd),
      debt: human(debtAfter, dd),
      collStated: ev.collAfter != null,
      debtStated: ev.debtAfter != null,
      conv: human(convAfter, dd),
      convUnread,
      convEstimated,
    });
    coll = collAfter;
    debt = debtAfter;
    conv = convAfter;
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
  /** The borrowed token the AMM holds in the bands now, tokens. */
  converted?: number | null;
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

const legOf = (r: LlamalendReplayed, k: string) => r.legs.find((l) => l.bucket === k && !l.conv)?.amount ?? 0;

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
      if (l.conv) inColl += l.amount;
      else if (COLL_KEYS.has(l.bucket)) inColl += l.amount * r.price;
      else inDebt += l.amount;
    }
    peak = Math.max(peak, inColl, inDebt, r.coll * r.price + r.conv, r.debt);
  }
  const scale = unitScaleFor(peak);
  return { replayed, borrowRate, borrowIndex, grain: 10 ** scale, scale };
}

/** The growth factor of a balance `dt` seconds after its row, at `rate`. */
const grow = (rate: number, dt: number) => 1 + rate * (Math.max(0, dt) / ONE_YEAR_S);

const COLL = "coll";
const DEBT = "debt";
/** The borrowed token in the bands, a second collateral asset. */
const CONV = "conv";

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
  const withConv = llamalendHasConv(events);
  const flowEvents: FlowEvent[] = replayed.map((r, i) => {
    const moved = { coll: false, debt: false };
    for (const l of r.legs) {
      if (BETWEEN_KEYS.has(l.bucket)) continue;
      if (COLL_KEYS.has(l.bucket)) moved.coll = true;
      else moved.debt = true;
    }
    const liq = r.ev.kind === "liquidation" && !r.ev.self;
    // What the row's figures rest on that the page did not read: its block's
    // oracle price (past the reads' cap, or not landed), and its balances
    // where the row states none and no read stood in.
    const unsure: FlowUnsure[] = [];
    if (r.priceFrom !== "row" && (r.coll > DUST || r.legs.some((l) => COLL_KEYS.has(l.bucket) && !l.conv)))
      unsure.push({
        side: "collateral",
        why:
          r.priceFrom === "today"
            ? `${o.collSymbol} priced at the latest block's oracle price: the oracle at this block is not stored yet, and the page reads the latest ${LLAMALEND_PRICE_READS} such event blocks.`
            : `${o.collSymbol} priced at the nearest priced row: the oracle at this block is not stored yet, and the page reads the latest ${LLAMALEND_PRICE_READS} such event blocks.`,
        held: true,
      });
    const unread = `Balances at this row not read: it states none, the server has not stored its block yet, and the page reads up to ${LLAMALEND_STATE_READS} such rows; the next row that states its balances settles both sides.`;
    if (!r.collStated) unsure.push({ side: "collateral", why: unread, untilNext: true });
    if (!r.debtStated) unsure.push({ side: "debt", why: unread, untilNext: true });
    if (r.convUnread)
      unsure.push({
        side: "collateral",
        why: `The ${o.debtSymbol} the AMM holds in the bands at this row is not stored yet: it stands as the row before left it until the next stored row.`,
        untilNext: true,
      });
    if (r.convEstimated)
      unsure.push({
        side: "collateral",
        why: r.ev.before
          ? `The ${o.debtSymbol} the AMM took in for its trades in this row's block, before the repay, is valued at this row's oracle price: the repay closed the position, and the balance is stored at the end of the block before.`
          : `The ${o.debtSymbol} the AMM took in for its trades since the row before is valued at this row's oracle price: the repay closed the position, and no balance is stored between.`,
      });
    return {
      id: r.ev.id,
      ts: r.ev.ts,
      block: r.ev.block,
      tick: liq ? "liquidation" : moved.coll && moved.debt ? "both" : moved.debt ? "debt" : "collateral",
      ...(unsure.length ? { unsure } : {}),
      legs: r.legs.map((l) =>
        COLL_KEYS.has(l.bucket) && !l.conv
          ? { bucket: l.bucket, usd: l.amount * cp(r), symbol: o.collSymbol }
          : { bucket: l.bucket, usd: l.amount * G, symbol: o.debtSymbol },
      ),
      tx: r.ev.tx,
      countsTx: !liq,
      balances: [
        { asset: COLL, symbol: o.collSymbol, side: "collateral", amount: Math.max(0, r.coll) },
        ...(withConv
          ? [{ asset: CONV, symbol: o.debtSymbol, side: "collateral" as const, amount: Math.max(0, r.conv) }]
          : []),
        { asset: DEBT, symbol: o.debtSymbol, side: "debt", amount: Math.max(0, r.debt), index: rp.borrowIndex[i] },
      ],
      // Every row states the price its collateral flows were valued at (its
      // own, or the nearest), so a card and the bars agree on its day.
      prices: [{ asset: COLL, usd: cp(r) }, ...(withConv ? [{ asset: CONV, usd: G }] : []), { asset: DEBT, usd: G }],
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
  const nowConv = open && withConv ? (o.live?.converted ?? last.conv) : 0;
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
  if (open && withConv && o.live?.converted != null) {
    const gap = o.live.converted - last.conv;
    if (Math.abs(gap) > tolOf(last.conv, last.ev.debtDecimals))
      pending.push({
        bucket: gap > 0 ? LL.softReceived : LL.softSpent,
        symbol: o.debtSymbol,
        usd: Math.abs(gap) * G,
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
    if (nowConv > DUST) assets.push({ side: "collateral", symbol: o.debtSymbol, amount: nowConv, usd: nowConv * G });
    if (nowDebt > DUST) assets.push({ side: "debt", symbol: o.debtSymbol, amount: nowDebt, usd: nowDebt * G });
  }

  return {
    unit: { symbol: o.debtSymbol, scale },
    buckets,
    days,
    live: {
      collateralUsd: open ? nowColl * priceNow + nowConv * G : 0,
      debtUsd: open ? nowDebt * G : 0,
      assets,
      ...(pending.length > 0 ? { pending } : {}),
    },
    todayPrices: { [COLL]: priceNow, [DEBT]: G, ...(withConv ? { [CONV]: G } : {}) },
    dailyPrices: {
      [COLL]: [...collObs].sort((a, b) => a[0] - b[0]),
      [DEBT]: unitObs,
      ...(withConv ? { [CONV]: unitObs } : {}),
    },
    seriesCarry: true,
    carriedWhy: {
      [COLL]: "LlamaLend is not in the daily price store, so a day between events keeps the last event's price.",
    },
    indexes,
    today: open ? today : endDay,
    labels: { collateral: "Collateral", debt: "Debt" },
    words: llamalendFlowWords(o.collSymbol, o.debtSymbol, withConv),
  };
}

/** The panel's words for a LlamaLend position. */
export function llamalendFlowWords(
  collSymbol: string,
  debtSymbol: string,
  withConv = false,
): NonNullable<FlowTimeline["words"]> {
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
      collateral: withConv
        ? `the ${collSymbol} in the bands after the last event, at the oracle price of the latest event that priced it, in ${debtSymbol}, and the ${debtSymbol} the AMM holds in the bands.`
        : `the ${collSymbol} in the bands after the last event, at the oracle price of the latest event that priced it, in ${debtSymbol}.`,
      debt: `the ${debtSymbol} owed after the last event, grown at the rate the market charged until its next event (after the last, the rate that meets today's debt).`,
    },
    linePrices: `in ${debtSymbol}, with the collateral at the oracle price of its latest priced event and the debt grown at the market's rate since the last event`,
    moment: {
      noPrice: {
        collateral: `No oracle price is recorded for this day, so the ${collSymbol} is stated in tokens.`,
      },
      notes: [
        withConv
          ? `The collateral is the ${collSymbol} in the bands and the ${debtSymbol} the AMM holds there from its sales, as the last event's block left them.`
          : `The collateral is the ${collSymbol} in the bands. What the AMM sold of it is held as ${debtSymbol} in the bands, which no event records, so it is not counted here.`,
      ],
    },
  };
}

/** The rows as the event cards' sums read them (lib/shared/flow-focus.ts):
 *  each row's legs in the model's figures (the unit in grains) and in
 *  tokens. Each side's figure just before and once the row's transaction had
 *  run is the transaction's last row's balance at that row's price, less the
 *  transaction's acts. The card's sums in tokens are the collateral token's
 *  and the debt's: a leg of the borrowed token in the bands carries no token
 *  amount, so it is in the figures and not in the collateral's tokens. */
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
    let convMove = 0;
    let debtMove = 0;
    for (const t of tx)
      for (const l of t.legs) {
        if (BETWEEN_KEYS.has(l.bucket)) continue;
        const sign = OUT_KEYS.has(l.bucket) ? -1 : 1;
        if (l.conv) convMove += sign * l.amount;
        else if (COLL_KEYS.has(l.bucket)) collMove += sign * l.amount;
        else debtMove += sign * l.amount;
      }
    const collHeld = Math.max(0, lastOf.coll);
    const convHeld = Math.max(0, lastOf.conv);
    const debtHeld = Math.max(0, lastOf.debt);
    const collPrice = cp(lastOf);
    return {
      id: r.ev.id,
      ts: r.ev.ts,
      ...(r.ev.tx ? { tx: r.ev.tx } : {}),
      legs: r.legs.map((l) =>
        l.conv
          ? {
              bucket: l.bucket,
              usd: l.amount * G,
              symbol: debtSymbol,
              ...(BETWEEN_KEYS.has(l.bucket) ? { accrual: true } : {}),
            }
          : COLL_KEYS.has(l.bucket)
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
          before: Math.max(0, collHeld - collMove) * collPrice + Math.max(0, convHeld - convMove) * G,
          after: collHeld * collPrice + convHeld * G,
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
  /** The server stored the position's state at its rows' blocks: the
   *  borrowed token in the bands is on the bars. */
  withConv: boolean;
  /** Rows whose converted balance is carried (not stored yet), and closing
   *  repays whose trades since the row before are valued at the row's
   *  price. */
  convUnreadRows: number;
  convEstimatedRows: number;
}

export function llamalendFlowFacts(rp: LlamalendFlowReplay, timeline: FlowTimeline | null): LlamalendFlowFacts {
  const pricing = { row: 0, nearest: 0, today: 0 };
  let convertedTaken = 0;
  for (const r of rp.replayed) {
    pricing[r.priceFrom]++;
    if (r.ev.kind === "liquidation" && !r.ev.self) convertedTaken += human(r.ev.convertedTaken, r.ev.debtDecimals);
  }
  const has = (k: string) => rp.replayed.filter((r) => r.legs.some((l) => l.bucket === k && !l.conv)).length;
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
    withConv: llamalendHasConv(rp.replayed.map((r) => r.ev)),
    convUnreadRows: rp.replayed.filter((r) => r.convUnread).length,
    convEstimatedRows: rp.replayed.filter((r) => r.convEstimated).length,
  };
}
