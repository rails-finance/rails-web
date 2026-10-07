// Lifetime flows for a Fluid vault position (an NFT holding collateral and
// debt in one vault): the page's rows replayed into the day rows the Lifetime
// flows panel reads (lib/shared/flows-timeline.ts; rails-ops
// reference/lifetime-flows-scrubber.md, "Fluid").
// ----------------------------------------------------------------------------
// Token units by charter. Fluid runs no USD feed: a vault's oracle prices its
// collateral in its debt token. So a position that borrowed is drawn in the
// debt token (`FlowTimeline.unit`), each collateral flow converted at the
// vault oracle's price; a position that never borrowed is drawn in its
// collateral token, which needs no price.
//
// Each row states both balances just before and after it as the vault's
// settled figures at the row's block (server mig 344, every row), so the
// replay splits every move exactly:
//
//     before − after of the position's last row = interest since that row
//     after − before                            = the act (deposit, withdraw,
//                                                 borrow, payback, or the
//                                                 liquidation's seizure and
//                                                 cleared debt)
//
// The vault rounds an event's amount into raw units, so a gap can fall a few
// base units below zero: that rounding stays inside the act, and the lines
// still add to the recorded balance.
//
// Prices. Each row carries the vault oracle's price at its block (server mig
// 114: every T1 event block, filled by the server's event filler, liquidation
// blocks first). A row the filler has not reached takes the nearest priced
// moment in time: a priced row of the position, or today's oracle read; the
// Explanation counts them. Between events the collateral takes the daily
// price store's price for the vault (`fluid:<vault>`, rails-ops
// reference/daily-prices.md, the oracle at each day's close), carrying the
// last one over days it lacks (`seriesCarry`); where the store did not
// answer, the collateral keeps its latest event's price.
//
// Between events each balance grows by the vault's exchange price as the rows
// imply it (`FlowTimeline.indexes`, basis `fluid-rows`): from one row to the
// next at the rate the next row's interest gives (its interest over the
// balance and the time, simple), and after the last row at the vault's rate
// now (the page's live read), today's figure being the live read itself.
//
// Smart vaults (DEX-share legs) are not replayed here: their legs have no
// token price the page can state (the page keeps their tower).
//
// Pure: tested offline in scripts/verify/verify-fluid-flows.ts.

import type { FlowBucket, FlowDayRow, FlowEvent, FlowIndexes, FlowTimeline } from "@/lib/shared/flows-timeline";
import { daysFromEvents, unitScaleFor } from "@/lib/shared/flows-timeline";
import type { FocusEvent } from "@/lib/shared/flow-focus";
import type { BaseActivityEvent, FluidContext, FluidEventType } from "@/lib/shared/types/event-shape";
import { isFluidEvent } from "@/lib/shared/types/event-shape";

const DAY_S = 86_400;
const ONE_YEAR_S = 31_557_600;
const DUST = 1e-12;

/** Bucket keys. */
export const FL = {
  collIn: "fl-coll-in",
  earned: "fl-earned",
  collOut: "fl-coll-out",
  collSeized: "fl-coll-seized",
  borrowed: "fl-borrowed",
  accrued: "fl-accrued",
  repaid: "fl-repaid",
  debtLiquidated: "fl-debt-liquidated",
} as const;

const COLL_KEYS = new Set<string>([FL.collIn, FL.earned, FL.collOut, FL.collSeized]);
const OUT_KEYS = new Set<string>([FL.collOut, FL.collSeized, FL.repaid, FL.debtLiquidated]);
const ACCRUAL_KEYS = new Set<string>([FL.earned, FL.accrued]);

const isLiquidation = (k: FluidEventType) => k === "liquidated" || k === "absorbed";

/** The buckets in drawing order: a position that borrowed draws Collateral
 *  and Debt, one that never did a single bar. */
export function fluidFlowBuckets(borrower: boolean): FlowBucket[] {
  const out: FlowBucket[] = [
    {
      key: FL.collIn,
      label: borrower ? "Collateral deposited" : "Deposited",
      event: "Deposit",
      side: "collateral",
      dir: "in",
    },
    // Interest is dashed (rails-ops reference/lifetime-flows-scrubber.md): it
    // moves on most events, so no event's name is its own.
    { key: FL.earned, label: "Interest earned", event: "", side: "collateral", dir: "in", hatch: "dashes" },
    {
      key: FL.collOut,
      label: borrower ? "Collateral withdrawn" : "Withdrawn",
      event: "Withdraw",
      side: "collateral",
      dir: "out",
    },
    {
      key: FL.collSeized,
      label: "Seized in liquidations",
      event: "Liquidation",
      side: "collateral",
      dir: "out",
      tone: "liquidation",
      hatch: "forward",
      link: "liquidation",
    },
  ];
  if (borrower)
    out.push(
      { key: FL.borrowed, label: "Borrowed", event: "Borrow", side: "debt", dir: "in" },
      { key: FL.accrued, label: "Interest accrued", event: "", side: "debt", dir: "in", hatch: "dashes" },
      { key: FL.repaid, label: "Repaid", event: "Payback", side: "debt", dir: "out" },
      {
        key: FL.debtLiquidated,
        label: "Cleared by liquidations",
        event: "Liquidation",
        side: "debt",
        dir: "out",
        tone: "liquidation",
        hatch: "forward",
        link: "liquidation",
      },
    );
  return out;
}

/** One balance-bearing row of a Fluid position, in human units. */
export interface FluidFlowEvent {
  id: string;
  /** Unix seconds. */
  ts: number;
  block: number;
  tx?: string;
  kind: FluidEventType;
  /** The vault's settled balances just before and after the row. */
  colBefore: number;
  colAfter: number;
  debtBefore: number;
  debtAfter: number;
  /** Each leg's base unit (10^-decimals), for telling the vault's rounding
   *  from a real move. */
  colUnit: number;
  debtUnit: number;
  /** The vault oracle at the row's block (debt token per collateral token),
   *  where the row carries it (mig 114). */
  price: number | null;
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Whether a row moves balances (an NFT mint or transfer moves none). */
const bearsBalance = (k: FluidEventType) => k !== "mint" && k !== "transfer";

/** The page's balance-bearing rows as the replay reads them, oldest first.
 *  A row without the chain's before (none on victoria, 1 Oct 2026) takes the
 *  last row's after as its before, so its interest is not counted. */
export function fluidFlowEvents(events: BaseActivityEvent[]): FluidFlowEvent[] {
  const rows = events.filter(isFluidEvent).filter((e) => bearsBalance(e.context.data.eventType));
  // Each leg's decimals, from a row stating it both raw and scaled.
  const unitOf = (pick: (c: FluidContext) => [string | undefined, string | undefined]): number => {
    for (const e of rows) {
      const [raw, human] = pick(e.context.data);
      const r = num(raw);
      const h = num(human);
      if (r != null && h != null && r > 0 && h > 0) return 10 ** -Math.round(Math.log10(r / h));
    }
    return 1e-18;
  };
  const colUnit = unitOf((c) => [c.raw?.colAfter, c.colAfter]);
  const debtUnit = unitOf((c) => [c.raw?.debtAfter, c.debtAfter]);
  if (rows.length > 1 && rows[0].blockNumber > rows[rows.length - 1].blockNumber) rows.reverse();
  rows.sort((a, b) => a.blockNumber - b.blockNumber);
  let col = 0;
  let debt = 0;
  return rows.map((e) => {
    const c = e.context.data as FluidContext;
    const colAfter = num(c.colAfter) ?? col + (num(c.colDelta) ?? 0);
    const debtAfter = num(c.debtAfter) ?? debt + (num(c.debtDelta) ?? 0);
    const out: FluidFlowEvent = {
      id: e.id,
      ts: e.timestamp,
      block: e.blockNumber,
      tx: e.txHash || undefined,
      kind: c.eventType,
      colBefore: num(c.colBefore) ?? col,
      colAfter,
      debtBefore: num(c.debtBefore) ?? debt,
      debtAfter,
      colUnit,
      debtUnit,
      price:
        c.oraclePriceAtBlock?.debtPerCol != null && c.oraclePriceAtBlock.debtPerCol > 0
          ? c.oraclePriceAtBlock.debtPerCol
          : null,
    };
    col = colAfter;
    debt = debtAfter;
    return out;
  });
}

/** Where a collateral flow's price came from: its row, the nearest priced
 *  row, or today's oracle read. */
export type FluidPriceFrom = "row" | "nearest" | "today";

/** A replayed row's legs in token units, by bucket. */
export interface FluidReplayed {
  ev: FluidFlowEvent;
  /** A balance fell before the row by more than the vault's rounding, with no
   *  row of its own: booked as a liquidation (the only act that lowers a
   *  Fluid balance without an operate). */
  unrecorded: boolean;
  /** The oracle price the row is valued at (debt per collateral), and where
   *  it came from. */
  price: number;
  priceFrom: FluidPriceFrom;
  legs: { bucket: string; amount: number }[];
  /** Balances after the row. */
  coll: number;
  debt: number;
}

/** The per-row replay. `livePrice` (today's oracle, debt per collateral) is
 *  the nearest price for rows nearer today than any priced row. */
export function replayFluid(events: FluidFlowEvent[], livePrice: number | null, now: number): FluidReplayed[] {
  const priced = events.filter((e) => e.price != null);
  let pi = 0;
  const nearest = (ts: number): { price: number; from: FluidPriceFrom } => {
    while (pi + 1 < priced.length && priced[pi + 1].ts <= ts) pi++;
    const cands: { dt: number; price: number; from: FluidPriceFrom }[] = [];
    const a = priced[pi];
    const b = priced[pi + 1];
    if (a) cands.push({ dt: Math.abs(a.ts - ts), price: a.price as number, from: "nearest" });
    if (b) cands.push({ dt: Math.abs(b.ts - ts), price: b.price as number, from: "nearest" });
    if (livePrice != null && livePrice > 0) cands.push({ dt: Math.abs(now - ts), price: livePrice, from: "today" });
    cands.sort((x, y) => x.dt - y.dt);
    return cands[0] ?? { price: 0, from: "nearest" };
  };
  let coll = 0;
  let debt = 0;
  const out: FluidReplayed[] = [];
  for (const ev of events) {
    const legs: { bucket: string; amount: number }[] = [];
    const add = (bucket: string, amount: number) => {
      if (Math.abs(amount) > DUST) legs.push({ bucket, amount });
    };
    const liq = isLiquidation(ev.kind);
    // Each side: the gap since the last row (interest; a fall past the
    // vault's rounding, three base units and a ten-thousandth of the balance,
    // is a liquidation no row records), then the act. A fall within the
    // rounding (a few millionths of the balance at most on victoria, 1 Oct
    // 2026) stays inside the act.
    const side = (
      before: number,
      after: number,
      last: number,
      unit: number,
      k: { interest: string; liq: string; up: string; down: string },
    ): boolean => {
      const gap = before - last;
      const fell = gap < -Math.max(3 * unit, last * 1e-4);
      if (fell) add(k.liq, -gap);
      const interest = Math.max(0, gap);
      add(k.interest, interest);
      const act = fell ? after - before : after - last - interest;
      if (liq && act < 0) add(k.liq, -act);
      else if (act > 0) add(k.up, act);
      else add(k.down, -act);
      return fell;
    };
    const cFell = side(ev.colBefore, ev.colAfter, coll, ev.colUnit, {
      interest: FL.earned,
      liq: FL.collSeized,
      up: FL.collIn,
      down: FL.collOut,
    });
    const dFell = side(ev.debtBefore, ev.debtAfter, debt, ev.debtUnit, {
      interest: FL.accrued,
      liq: FL.debtLiquidated,
      up: FL.borrowed,
      down: FL.repaid,
    });
    const own = ev.price != null;
    const p = own ? { price: ev.price as number, from: "row" as const } : nearest(ev.ts);
    // Two legs into one bucket (an unrecorded fall and the row's own
    // liquidation) are one line.
    const merged: { bucket: string; amount: number }[] = [];
    for (const l of legs) {
      const m = merged.find((x) => x.bucket === l.bucket);
      if (m) m.amount += l.amount;
      else merged.push({ ...l });
    }
    out.push({
      ev,
      unrecorded: cFell || dFell,
      price: p.price,
      priceFrom: p.from,
      legs: merged,
      coll: ev.colAfter,
      debt: ev.debtAfter,
    });
    coll = ev.colAfter;
    debt = ev.debtAfter;
  }
  return out;
}

/** What the page's live read states now, where it has one. */
export interface FluidLive {
  /** The vault oracle now, debt token per collateral token (operate price). */
  price: number | null;
  /** The settled balances now. */
  coll?: number;
  debt?: number;
  /** The vault's rates now, fractions a year. */
  supplyApr?: number | null;
  borrowApr?: number | null;
}

export interface FluidFlowOptions {
  collSymbol: string;
  debtSymbol: string;
  /** Unix seconds now; the page's clock. */
  now: number;
  /** The position is open (the page's verdict). */
  open: boolean;
  live: FluidLive | null;
  /** The daily store's price for the vault, `[UTC day, debt per collateral]`
   *  ascending; null or absent where the read failed or answered nothing. */
  daily?: [number, number][] | null;
}

/** The replay with the rates between rows, for the timeline, the cards and
 *  the tests. */
export interface FluidFlowReplay {
  replayed: FluidReplayed[];
  /** A position that ever owed draws two bars, in the debt token. */
  borrower: boolean;
  /** Per row, the collateral's and the debt's rate (fractions a year) from
   *  that row to the next, the last row's the vault's rate now. */
  supplyRate: number[];
  borrowRate: number[];
  /** Per row, the side's implied exchange price: 1 at the first row. */
  supplyIndex: number[];
  borrowIndex: number[];
  /** Grains per token of the unit: the model's figures are the unit × this. */
  grain: number;
  scale: number;
  /** The unit: the debt token for a borrower, else the collateral token. */
  unitSymbol: string;
}

function rateBetween(interest: number, balance: number, dt: number): number {
  return balance > DUST && dt > 0 ? interest / balance / (dt / ONE_YEAR_S) : 0;
}

/** Whether any row ever owed. */
export function fluidBorrower(events: FluidFlowEvent[]): boolean {
  return events.some((e) => e.debtBefore > 0 || e.debtAfter > 0);
}

export function fluidFlowReplay(events: FluidFlowEvent[], o: FluidFlowOptions): FluidFlowReplay {
  const livePrice = o.live?.price != null && o.live.price > 0 ? o.live.price : null;
  const replayed = replayFluid(events, livePrice, o.now);
  const borrower = fluidBorrower(events);
  const supplyRate: number[] = [];
  const borrowRate: number[] = [];
  const supplyIndex: number[] = [];
  const borrowIndex: number[] = [];
  const legOf = (r: FluidReplayed, k: string) => r.legs.find((l) => l.bucket === k)?.amount ?? 0;
  let si = 1;
  let bi = 1;
  for (let i = 0; i < replayed.length; i++) {
    const r = replayed[i];
    const prev = replayed[i - 1];
    if (prev) {
      if (prev.coll > DUST) si *= 1 + legOf(r, FL.earned) / prev.coll;
      if (prev.debt > DUST) bi *= 1 + legOf(r, FL.accrued) / prev.debt;
    }
    supplyIndex.push(si);
    borrowIndex.push(bi);
    const next = replayed[i + 1];
    if (!next) {
      supplyRate.push(o.live?.supplyApr ?? (i > 0 ? supplyRate[i - 1] : 0));
      borrowRate.push(o.live?.borrowApr ?? (i > 0 ? borrowRate[i - 1] : 0));
      continue;
    }
    const dt = next.ev.ts - r.ev.ts;
    // A gap with no time (two rows in one block) keeps the rate before it.
    supplyRate.push(dt > 0 ? rateBetween(legOf(next, FL.earned), r.coll, dt) : (supplyRate[i - 1] ?? 0));
    borrowRate.push(dt > 0 ? rateBetween(legOf(next, FL.accrued), r.debt, dt) : (borrowRate[i - 1] ?? 0));
  }
  // The scale: about five significant digits of the largest figure the bars
  // can reach, in the unit.
  const cp = (r: FluidReplayed) => (borrower ? r.price : 1);
  let peak = 0;
  let inColl = 0;
  let inDebt = 0;
  for (const r of replayed) {
    for (const l of r.legs) {
      if (OUT_KEYS.has(l.bucket)) continue;
      if (COLL_KEYS.has(l.bucket)) inColl += l.amount * cp(r);
      else inDebt += l.amount;
    }
    peak = Math.max(peak, inColl, inDebt, r.coll * cp(r), r.debt);
  }
  const scale = unitScaleFor(peak);
  return {
    replayed,
    borrower,
    supplyRate,
    borrowRate,
    supplyIndex,
    borrowIndex,
    grain: 10 ** scale,
    scale,
    unitSymbol: borrower ? o.debtSymbol : o.collSymbol,
  };
}

/** The growth factor of a balance `dt` seconds after its row, at `rate`. */
const grow = (rate: number, dt: number) => 1 + rate * (Math.max(0, dt) / ONE_YEAR_S);

const COLL = "coll";
const DEBT = "debt";

/** The position's rows as the Lifetime flows panel's timeline, in the debt
 *  token (a borrower) or the collateral token. Null with no rows, or where a
 *  borrower's collateral has no price at all. */
export function fluidFlowTimeline(events: FluidFlowEvent[], o: FluidFlowOptions): FlowTimeline | null {
  if (events.length === 0) return null;
  const rp = fluidFlowReplay(events, o);
  const { replayed, borrower, grain: G, scale } = rp;
  if (borrower && !replayed.some((r) => r.price > 0)) return null;
  // The collateral's price in the unit, per row: the oracle's for a borrower,
  // one grain a token for a position drawn in its collateral.
  const cp = (r: FluidReplayed) => (borrower ? r.price * G : G);
  const buckets = fluidFlowBuckets(borrower);
  const flowEvents: FlowEvent[] = replayed.map((r, i) => {
    const moved = { coll: false, debt: false };
    for (const l of r.legs) {
      if (ACCRUAL_KEYS.has(l.bucket)) continue;
      if (COLL_KEYS.has(l.bucket)) moved.coll = true;
      else moved.debt = true;
    }
    const balances: FlowEvent["balances"] = [
      {
        asset: COLL,
        symbol: o.collSymbol,
        side: "collateral",
        amount: Math.max(0, r.coll),
        index: rp.supplyIndex[i],
      },
    ];
    const prices: FlowEvent["prices"] = [];
    // Every row states the price its collateral flows were valued at (its
    // own, or the nearest), so a card and the bars agree on its day.
    prices.push({ asset: COLL, usd: cp(r) });
    if (borrower) {
      balances.push({
        asset: DEBT,
        symbol: o.debtSymbol,
        side: "debt",
        amount: Math.max(0, r.debt),
        index: rp.borrowIndex[i],
      });
      prices.push({ asset: DEBT, usd: G });
    }
    const liq = isLiquidation(r.ev.kind);
    // A row the server's filler has not reached is priced at the nearest
    // priced moment: its collateral figures that day rest on that price.
    const unpriced =
      borrower && r.priceFrom !== "row" && (r.coll > DUST || r.legs.some((l) => COLL_KEYS.has(l.bucket)));
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
      balances,
      prices,
      ...(unpriced
        ? {
            unsure: [
              {
                side: "collateral" as const,
                why:
                  r.priceFrom === "today"
                    ? `${o.collSymbol} priced at the latest block's oracle price: the oracle price at this block is not stored yet.`
                    : `${o.collSymbol} priced at the nearest priced row: the oracle price at this block is not stored yet.`,
                held: true,
              },
            ],
          }
        : {}),
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

  // Now: the live read where the page has one, else the last row grown at
  // the vault's rate.
  const sinceLast = o.now - last.ev.ts;
  const nowColl = open ? (o.live?.coll ?? last.coll * grow(rp.supplyRate[li], sinceLast)) : 0;
  const nowDebt = open ? (o.live?.debt ?? last.debt * grow(rp.borrowRate[li], sinceLast)) : 0;
  const priceNow = borrower ? (livePrice ?? last.price) * G : G;

  // The collateral's price: the store's on each day, each event day the price
  // its flows were valued at, and today's.
  const daily = o.daily && o.daily.length > 0 ? o.daily : null;
  const collObs = new Map<number, number>();
  if (borrower) {
    for (const [d, p] of daily ?? []) if (d < today && p > 0) collObs.set(d, p * G);
    for (const r of replayed) collObs.set(Math.floor(r.ev.ts / DAY_S), cp(r));
    if (livePrice != null && open) collObs.set(today, livePrice * G);
  }
  // Each balance's exchange price at each day's close: the last row's, grown
  // at the rate since to the day's end; today's meets the live read. A token
  // in its own unit has one grain a token every day.
  const supplyRows: [number, number | null, number | null][] = [];
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
    supplyRows.push([
      d,
      rp.supplyIndex[ei] * (isNow && r.coll > DUST ? nowColl / r.coll : grow(rp.supplyRate[ei], end - r.ev.ts)),
      null,
    ]);
    borrowRows.push([
      d,
      null,
      rp.borrowIndex[ei] * (isNow && r.debt > DUST ? nowDebt / r.debt : grow(rp.borrowRate[ei], end - r.ev.ts)),
    ]);
  }
  const indexes: FlowIndexes = { basis: "fluid-rows", assets: { [COLL]: supplyRows } };
  if (borrower) indexes.assets[DEBT] = borrowRows;

  const assets: NonNullable<FlowTimeline["live"]["assets"]> = [];
  if (open) {
    if (nowColl > DUST)
      assets.push({ side: "collateral", symbol: o.collSymbol, amount: nowColl, usd: nowColl * priceNow });
    if (borrower && nowDebt > DUST)
      assets.push({ side: "debt", symbol: o.debtSymbol, amount: nowDebt, usd: nowDebt * G });
  }

  const dailyPrices: Record<string, [number, number][]> = {
    [COLL]: borrower ? [...collObs].sort((a, b) => a[0] - b[0]) : unitObs,
  };
  if (borrower) dailyPrices[DEBT] = unitObs;

  return {
    unit: { symbol: rp.unitSymbol, scale },
    buckets,
    days,
    live: {
      collateralUsd: open ? nowColl * priceNow : 0,
      debtUsd: open && borrower ? nowDebt * G : 0,
      assets,
    },
    todayPrices: { [COLL]: priceNow, ...(borrower ? { [DEBT]: G } : {}) },
    dailyPrices,
    seriesCarry: true,
    // Without the store, a day between events keeps the last event's price.
    ...(borrower && !daily
      ? {
          carriedWhy: {
            [COLL]: "no daily price is stored for this vault, so a day between events keeps the last event's price.",
          },
        }
      : {}),
    indexes,
    today: open ? today : endDay,
    labels: { collateral: "Collateral", debt: "Debt" },
    words: fluidFlowWords(o.collSymbol, o.debtSymbol, borrower, daily != null),
  };
}

/** The panel's words for a Fluid position; `daily`: the store answered. */
export function fluidFlowWords(
  collSymbol: string,
  debtSymbol: string,
  borrower: boolean,
  daily = false,
): NonNullable<FlowTimeline["words"]> {
  if (!borrower)
    return {
      held: "Still deposited",
      restBySide: { collateral: "Interest since the last event" },
      restNote: {
        collateral: `the interest the ${collSymbol} earned at the vault's rate since the position's last event`,
      },
      basis: { collateral: `Every figure is in ${collSymbol}, the vault's collateral token.` },
      heldBasis: {
        collateral: `the ${collSymbol} deposited after the last event by then, grown at the rate the vault paid until its next event (after the last, its supply rate now).`,
      },
      linePrices: `in ${collSymbol}, grown at the vault's supply rate since the last event`,
      moment: { notes: [] },
    };
  return {
    held: "Still deposited",
    restBySide: {
      collateral: "Market move and interest since the last event",
      debt: "Interest since the last event",
    },
    restNote: {
      collateral: `the change in ${collSymbol}'s oracle price, in ${debtSymbol}, since each flow, and the interest the ${collSymbol} earned since the position's last event`,
      debt: "the interest built up on the debt at the vault's rate since the position's last event",
    },
    basis: {
      collateral: `Every figure is in ${debtSymbol}, the vault's debt token; each ${collSymbol} flow is converted at the vault oracle's price at its block where one is recorded, else at the nearest recorded one.`,
      debt: `Every figure is in ${debtSymbol}, the vault's debt token.`,
    },
    heldBasis: {
      collateral: daily
        ? `the ${collSymbol} held after the last event by then, grown at the rate the vault paid until its next event (after the last, its supply rate now), at the vault oracle's price at the close of that day, in ${debtSymbol}.`
        : `the ${collSymbol} held after the last event by then, grown at the rate the vault paid until its next event (after the last, its supply rate now), at the vault oracle's price of the latest event that priced it, in ${debtSymbol}.`,
      debt: `the ${debtSymbol} owed after the last event by then, grown at the rate the vault charged until its next event (after the last, its borrow rate now).`,
    },
    linePrices: daily
      ? `in ${debtSymbol}, with the collateral at the vault oracle's price at each day's close and both sides grown at the vault's rates since the last event`
      : `in ${debtSymbol}, with the collateral at the vault oracle's price of its latest priced event and both sides grown at the vault's rates since the last event`,
    moment: {
      noPrice: {
        collateral: `No oracle price is recorded for this day, so the ${collSymbol} is stated in tokens.`,
      },
      notes: [],
    },
  };
}

/** The rows as the event cards' sums read them (lib/shared/flow-focus.ts):
 *  each row's legs in the model's figures (the unit in grains) and in
 *  tokens, the legs the day rows add up. Each side's figure just before and
 *  once the row's transaction had run is the transaction's last row's balance
 *  at that row's price, less the transaction's acts. */
export function fluidFocusEvents(rp: FluidFlowReplay, collSymbol: string, debtSymbol: string): FocusEvent[] {
  const { replayed, borrower, grain: G } = rp;
  const cp = (r: FluidReplayed) => (borrower ? r.price * G : G);
  const byTx = new Map<string, FluidReplayed[]>();
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
        if (ACCRUAL_KEYS.has(l.bucket)) continue;
        const sign = OUT_KEYS.has(l.bucket) ? -1 : 1;
        if (COLL_KEYS.has(l.bucket)) collMove += sign * l.amount;
        else debtMove += sign * l.amount;
      }
    const collHeld = Math.max(0, lastOf.coll);
    const debtHeld = Math.max(0, lastOf.debt);
    const collPrice = cp(lastOf);
    const rate = borrower ? rp.borrowRate[i] : rp.supplyRate[i];
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
              ...(ACCRUAL_KEYS.has(l.bucket) ? { accrual: true } : {}),
            }
          : {
              bucket: l.bucket,
              usd: l.amount * G,
              amount: l.amount,
              symbol: debtSymbol,
              ...(ACCRUAL_KEYS.has(l.bucket) ? { accrual: true } : {}),
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
      rate: rate * 100,
    };
  });
}

/** How the collateral flows were priced: at their own block (`rowLiq` of
 *  them liquidations), at the nearest priced row's, or at today's oracle
 *  read. */
export function fluidPricing(rp: FluidFlowReplay): { row: number; rowLiq: number; nearest: number; today: number } {
  const out = { row: 0, rowLiq: 0, nearest: 0, today: 0 };
  if (!rp.borrower) return out;
  for (const r of rp.replayed) {
    if (!r.legs.some((l) => COLL_KEYS.has(l.bucket) && l.bucket !== FL.earned)) continue;
    out[r.priceFrom]++;
    if (r.priceFrom === "row" && isLiquidation(r.ev.kind)) out.rowLiq++;
  }
  return out;
}
