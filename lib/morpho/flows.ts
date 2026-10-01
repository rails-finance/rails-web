// Lifetime flows for a Morpho Blue position, a (market, wallet) pair: the
// page's rows replayed into the day rows the Lifetime flows panel reads
// (lib/shared/flows-timeline.ts; rails-ops reference/lifetime-flows-scrubber.md,
// "Morpho").
// ----------------------------------------------------------------------------
// Token units by charter. Morpho Blue prices nothing in USD: a market's oracle
// prices its collateral in its loan token. So the bars and the line are in the
// loan token (`FlowTimeline.unit`), and the collateral is converted at the
// market's oracle price at each event's block (liquidation rows carry it,
// server mig 112; the page reads the others from /api/chain/morpho/at-block,
// the read the opened card makes).
//
// Each row states the position after it, as the market's totals price its
// shares (toAssetsUp on the debt, toAssetsDown on the supply), and the same
// just before it, so the replay splits every move exactly:
//
//     debt before − debt after the last row   = interest accrued between
//     debt after − debt before                = the act (borrow, repay, the
//                                                liquidation's repaid debt and
//                                                bad debt)
//     supply before − supply after the last row = interest earned between,
//                                                less bad debt the market
//                                                socialised (a loss shows as
//                                                bad debt)
//     supply after − supply before            = the act (supply, withdraw)
//
// A liquidation that leaves no collateral writes the rest of the debt off as
// bad debt: what the liquidator repaid is the seized collateral at the oracle
// price over the liquidation incentive (Morpho.sol's arithmetic, to a few base
// units), and the rest of the debt it cleared is bad debt.
//
// Between events the debt and the supply grow at the rate the market paid
// between those two events (the next event's interest over the balance and
// the time), and after the last event at the market's rate now. The
// collateral keeps the oracle price of its latest event: no daily oracle
// series is recorded.
//
// Pure: tested offline in scripts/verify/verify-morpho-flows.ts.

import type { FlowBucket, FlowDayRow, FlowEvent, FlowTimeline } from "@/lib/shared/flows-timeline";
import { daysFromEvents, unitScaleFor } from "@/lib/shared/flows-timeline";
import type { FocusEvent } from "@/lib/shared/flow-focus";
import type { BaseActivityEvent, MorphoContext, MorphoEventType } from "@/lib/shared/types/event-shape";
import { isMorphoEvent } from "@/lib/shared/types/event-shape";

const DAY_S = 86_400;
const ONE_YEAR_S = 31_557_600;
const DUST = 1e-12;

/** Bucket keys. */
export const MO = {
  collIn: "mo-coll-in",
  collOut: "mo-coll-out",
  collSeized: "mo-coll-seized",
  supplied: "mo-supplied",
  earned: "mo-earned",
  withdrawn: "mo-withdrawn",
  supplyLoss: "mo-supply-loss",
  borrowed: "mo-borrowed",
  accrued: "mo-accrued",
  repaid: "mo-repaid",
  debtLiquidated: "mo-debt-liquidated",
  badDebt: "mo-bad-debt",
} as const;

const COLL_KEYS = new Set<string>([MO.collIn, MO.collOut, MO.collSeized]);
const SUPPLY_KEYS = new Set<string>([MO.supplied, MO.earned, MO.withdrawn, MO.supplyLoss]);
const OUT_KEYS = new Set<string>([
  MO.collOut,
  MO.collSeized,
  MO.withdrawn,
  MO.supplyLoss,
  MO.repaid,
  MO.debtLiquidated,
  MO.badDebt,
]);
const ACCRUAL_KEYS = new Set<string>([MO.earned, MO.accrued, MO.supplyLoss]);

/** Which sides of a Morpho position the page draws: the borrower's
 *  collateral and debt, the lender's supply, or both. */
export interface MorphoRoles {
  borrower: boolean;
  lender: boolean;
}

/** The buckets in drawing order. A lender's supply sits on the collateral
 *  side: it is what the position holds in the market. */
export function morphoFlowBuckets(roles: MorphoRoles): FlowBucket[] {
  const out: FlowBucket[] = [];
  if (roles.borrower)
    out.push(
      { key: MO.collIn, label: "Collateral deposited", event: "Deposit", side: "collateral", dir: "in" },
      {
        key: MO.collOut,
        label: "Collateral withdrawn",
        event: "Withdraw",
        side: "collateral",
        dir: "out",
      },
      {
        key: MO.collSeized,
        label: "Seized in liquidations",
        event: "Liquidation",
        side: "collateral",
        dir: "out",
        tone: "liquidation",
        hatch: "forward",
        link: "liquidation",
      },
    );
  if (roles.lender)
    out.push(
      {
        key: MO.supplied,
        label: "Supplied",
        event: "Supply",
        side: "collateral",
        dir: "in",
        ...(roles.borrower ? { hatch: "grid" as const } : {}),
      },
      // Interest is dashed (rails-ops reference/lifetime-flows-scrubber.md):
      // the event's own words name none, since it moves on most events.
      { key: MO.earned, label: "Interest earned", event: "", side: "collateral", dir: "in", hatch: "dashes" },
      {
        key: MO.withdrawn,
        label: roles.borrower ? "Supply withdrawn" : "Withdrawn",
        event: "Withdraw",
        side: "collateral",
        dir: "out",
        ...(roles.borrower ? { hatch: "cross" as const } : {}),
      },
      {
        key: MO.supplyLoss,
        label: "Bad debt realised",
        event: "",
        side: "collateral",
        dir: "out",
        tone: "liquidation",
        hatch: "vertical",
      },
    );
  if (roles.borrower)
    out.push(
      { key: MO.borrowed, label: "Borrowed", event: "Borrow", side: "debt", dir: "in" },
      { key: MO.accrued, label: "Interest accrued", event: "", side: "debt", dir: "in", hatch: "dashes" },
      { key: MO.repaid, label: "Repaid", event: "Repay", side: "debt", dir: "out" },
      {
        key: MO.debtLiquidated,
        label: "Repaid by liquidators",
        event: "Liquidation",
        side: "debt",
        dir: "out",
        tone: "liquidation",
        hatch: "forward",
        link: "liquidation",
      },
      {
        key: MO.badDebt,
        label: "Bad debt written off",
        event: "Debt written off",
        side: "debt",
        dir: "out",
        tone: "liquidation",
        hatch: "dots",
        link: "liquidation",
      },
    );
  return out;
}

/** One row of a Morpho position, in human units. */
export interface MorphoFlowEvent {
  id: string;
  /** Unix seconds. */
  ts: number;
  block: number;
  tx?: string;
  kind: MorphoEventType;
  /** The collateral after the row, and its signed move (collateral token). */
  collAfter: number | null;
  collDelta: number;
  /** What the position owed just before and after the row (loan token):
   *  borrow shares at the market's totals; the principal where the answer
   *  carries no totals. */
  debtBefore: number | null;
  debtAfter: number | null;
  /** The supply just before and after the row, at the market's totals. */
  supplyBefore: number | null;
  supplyAfter: number | null;
  /** A supply or withdraw's own amount (loan token), for a row whose supply
   *  is the principal (no totals). */
  assetsDelta: number;
  /** A liquidation's |borrow delta|: repaid plus any bad debt. */
  loanRepaid: number;
  /** The market oracle at the block (loan token per collateral token), where
   *  the row or a read states it. */
  price: number | null;
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** The page's rows as the replay reads them, oldest first; `prices` the
 *  oracle read at each block, by block. */
export function morphoFlowEvents(events: BaseActivityEvent[], prices?: Map<number, number> | null): MorphoFlowEvent[] {
  // The served order within a block is the chain's (transaction, then log);
  // a newest-first list is turned round first, and the sort is stable.
  const rows = events.filter(isMorphoEvent);
  if (rows.length > 1 && rows[0].blockNumber > rows[rows.length - 1].blockNumber) rows.reverse();
  rows.sort((a, b) => a.blockNumber - b.blockNumber);
  return rows.map((e) => {
    const c = e.context.data as MorphoContext;
    const delta = num(c.assetsDelta) ?? 0;
    const stored = c.oraclePriceAtBlock?.loanPerCollateral;
    const read = prices?.get(e.blockNumber);
    return {
      id: e.id,
      ts: e.timestamp,
      block: e.blockNumber,
      tx: e.txHash,
      kind: c.eventType,
      collAfter: num(c.collateralAfter),
      collDelta: c.side === "collateral" ? delta : 0,
      debtBefore: num(c.debtBefore),
      debtAfter: num(c.debtAfter) ?? num(c.borrowedAfter),
      supplyBefore: num(c.supplyBefore),
      supplyAfter: num(c.suppliedAfter),
      assetsDelta: c.side === "loan" ? delta : 0,
      loanRepaid: num(c.loanRepaid) ?? 0,
      price: stored != null && stored > 0 ? stored : read != null && read > 0 ? read : null,
    };
  });
}

/** The blocks whose oracle price the replay needs read: every row that
 *  moved collateral first, then the rest, newest first within each, each
 *  block once, at most `cap`. Liquidation rows carry theirs. */
export function morphoPriceBlocks(events: MorphoFlowEvent[], cap = 250): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  const push = (b: number) => {
    if (seen.has(b) || out.length >= cap) return;
    seen.add(b);
    out.push(b);
  };
  const need = events.filter((e) => e.price == null);
  const coll = need.filter((e) => Math.abs(e.collDelta) > DUST).reverse();
  for (const e of coll) push(e.block);
  for (const e of [...need].reverse()) push(e.block);
  return out;
}

/** The liquidation incentive factor for a market's LLTV (Morpho.sol). */
export function morphoLif(lltv: number): number {
  return Math.min(1.15, 1 / (1 - 0.3 * (1 - lltv)));
}

/** A replayed row's legs in token units, by bucket. */
export interface MorphoReplayed {
  ev: MorphoFlowEvent;
  /** The oracle price the row is valued at, and whether it was the row's
   *  own (else the nearest priced row's). */
  price: number;
  ownPrice: boolean;
  legs: { bucket: string; amount: number }[];
  /** Balances after the row. */
  coll: number;
  debt: number;
  supply: number;
}

/** The per-row replay. `lltv` sizes a bad-debt liquidation's repaid part. */
export function replayMorpho(events: MorphoFlowEvent[], lltv: number): MorphoReplayed[] {
  const lif = morphoLif(lltv);
  const firstPrice = events.find((e) => e.price != null)?.price ?? 0;
  let lastPrice = firstPrice;
  let coll = 0;
  let debt = 0;
  let supply = 0;
  const out: MorphoReplayed[] = [];
  for (const ev of events) {
    const own = ev.price != null && ev.price > 0;
    if (own) lastPrice = ev.price as number;
    const legs: { bucket: string; amount: number }[] = [];
    const add = (bucket: string, amount: number) => {
      if (Math.abs(amount) > DUST) legs.push({ bucket, amount });
    };
    // Collateral: the recorded balance where the row states it.
    const collAfter = ev.collAfter ?? Math.max(0, coll + ev.collDelta);
    const dColl = collAfter - coll;
    if (ev.kind === "liquidation") add(MO.collSeized, -dColl);
    else if (dColl > 0) add(MO.collIn, dColl);
    else add(MO.collOut, -dColl);
    // Debt: interest since the last row, then the act.
    const debtAfter = ev.debtAfter ?? debt;
    const debtBefore = ev.debtBefore ?? debt;
    add(MO.accrued, debtBefore - debt);
    const act = debtAfter - debtBefore;
    if (ev.kind === "liquidation") {
      const cleared = Math.max(0, -act);
      // No collateral left: the rest of the debt is written off.
      const price = own ? (ev.price as number) : lastPrice;
      const seizedValue = (-dColl * price) / lif;
      const bad = collAfter <= DUST && debtAfter <= DUST && price > 0 ? Math.max(0, cleared - seizedValue) : 0;
      add(MO.debtLiquidated, cleared - bad);
      add(MO.badDebt, bad);
      if (act > 0) add(MO.borrowed, act);
    } else if (act > 0) add(MO.borrowed, act);
    else add(MO.repaid, -act);
    // Supply: interest (or a loss) since the last row, then the act.
    let supplyAfter = supply;
    if (ev.supplyAfter != null && ev.supplyBefore != null) {
      const gap = ev.supplyBefore - supply;
      if (gap >= 0) add(MO.earned, gap);
      else add(MO.supplyLoss, -gap);
      const sAct = ev.supplyAfter - ev.supplyBefore;
      if (sAct > 0) add(MO.supplied, sAct);
      else add(MO.withdrawn, -sAct);
      supplyAfter = ev.supplyAfter;
    } else if (ev.kind === "supply" || ev.kind === "withdraw") {
      // The sweep's principal rows: the act alone.
      const sAct = ev.supplyAfter != null ? ev.supplyAfter - supply : ev.assetsDelta;
      if (sAct > 0) add(MO.supplied, sAct);
      else add(MO.withdrawn, -sAct);
      supplyAfter = supply + sAct;
    }
    out.push({
      ev,
      price: own ? (ev.price as number) : lastPrice,
      ownPrice: own,
      legs,
      coll: collAfter,
      debt: debtAfter,
      supply: supplyAfter,
    });
    coll = collAfter;
    debt = debtAfter;
    supply = supplyAfter;
  }
  return out;
}

/** The roles a replay shows: a borrower where any row moved collateral or
 *  debt, a lender where any moved the supply. */
export function morphoRoles(replayed: MorphoReplayed[]): MorphoRoles {
  let borrower = false;
  let lender = false;
  for (const r of replayed)
    for (const l of r.legs) {
      if (SUPPLY_KEYS.has(l.bucket)) lender = true;
      else borrower = true;
    }
  if (!borrower && !lender) borrower = true;
  return { borrower, lender };
}

/** The rate (a fraction a year) a balance grew at between two rows: the
 *  later row's interest over the earlier row's balance and the time. */
function rateBetween(interest: number, balance: number, dt: number): number {
  return balance > DUST && dt > 0 ? interest / balance / (dt / ONE_YEAR_S) : 0;
}

/** What the page's live read states now, where it has one. */
export interface MorphoLive {
  /** The market oracle now, loan token per collateral token. */
  price: number | null;
  coll?: number;
  debt?: number;
  supply?: number;
  /** The market's rates now, fractions a year. */
  borrowApr?: number | null;
  supplyApr?: number | null;
}

export interface MorphoFlowOptions {
  loanSymbol: string;
  collSymbol: string;
  lltv: number;
  /** Unix seconds now; the page's clock. */
  now: number;
  live: MorphoLive | null;
}

/** The replay with the rates between rows, for the timeline, the cards and
 *  the tests. */
export interface MorphoFlowReplay {
  replayed: MorphoReplayed[];
  roles: MorphoRoles;
  /** Per row, the debt's and the supply's rate (fractions a year) from that
   *  row to the next, the last row's the market's rate now. */
  borrowRate: number[];
  supplyRate: number[];
  /** Grains per token: the model's figures are the loan token × this. */
  grain: number;
  scale: number;
}

export function morphoFlowReplay(events: MorphoFlowEvent[], o: MorphoFlowOptions): MorphoFlowReplay {
  const replayed = replayMorpho(events, o.lltv);
  const roles = morphoRoles(replayed);
  const borrowRate: number[] = [];
  const supplyRate: number[] = [];
  for (let i = 0; i < replayed.length; i++) {
    const r = replayed[i];
    const next = replayed[i + 1];
    if (!next) {
      borrowRate.push(o.live?.borrowApr ?? (i > 0 ? borrowRate[i - 1] : 0));
      supplyRate.push(o.live?.supplyApr ?? (i > 0 ? supplyRate[i - 1] : 0));
      continue;
    }
    const dt = next.ev.ts - r.ev.ts;
    const accrued = next.legs.find((l) => l.bucket === MO.accrued)?.amount ?? 0;
    const earned =
      (next.legs.find((l) => l.bucket === MO.earned)?.amount ?? 0) -
      (next.legs.find((l) => l.bucket === MO.supplyLoss)?.amount ?? 0);
    // A gap with no time (two rows in one block) keeps the rate before it.
    borrowRate.push(dt > 0 ? rateBetween(accrued, r.debt, dt) : (borrowRate[i - 1] ?? 0));
    supplyRate.push(dt > 0 ? rateBetween(earned, r.supply, dt) : (supplyRate[i - 1] ?? 0));
  }
  // The scale: about five significant digits of the largest figure the bars
  // can reach, in the loan token.
  let peak = 0;
  let inColl = 0;
  let inDebt = 0;
  for (const r of replayed) {
    for (const l of r.legs) {
      const v = COLL_KEYS.has(l.bucket) ? l.amount * r.price : l.amount;
      if (OUT_KEYS.has(l.bucket)) continue;
      if (COLL_KEYS.has(l.bucket) || SUPPLY_KEYS.has(l.bucket)) inColl += v;
      else inDebt += v;
    }
    peak = Math.max(peak, inColl, inDebt, r.coll * r.price + r.supply, r.debt);
  }
  const scale = unitScaleFor(peak);
  return { replayed, roles, borrowRate, supplyRate, grain: 10 ** scale, scale };
}

/** The growth factor of a balance `dt` seconds after its row, at `rate`. */
const grow = (rate: number, dt: number) => 1 + rate * (Math.max(0, dt) / ONE_YEAR_S);

const COLL = "coll";
const SUPPLY = "supply";
const DEBT = "debt";

/** The position's rows as the Lifetime flows panel's timeline, in the loan
 *  token. Null with no rows. */
export function morphoFlowTimeline(events: MorphoFlowEvent[], o: MorphoFlowOptions): FlowTimeline | null {
  if (events.length === 0) return null;
  const rp = morphoFlowReplay(events, o);
  const { replayed, roles, grain: G, scale } = rp;
  const buckets = morphoFlowBuckets(roles);
  const flowEvents: FlowEvent[] = replayed.map((r) => {
    const moved = { coll: false, debt: false };
    for (const l of r.legs) {
      if (ACCRUAL_KEYS.has(l.bucket)) continue;
      if (COLL_KEYS.has(l.bucket) || SUPPLY_KEYS.has(l.bucket)) moved.coll = true;
      else moved.debt = true;
    }
    const balances: FlowEvent["balances"] = [];
    const prices: FlowEvent["prices"] = [];
    if (roles.borrower) {
      balances.push({ asset: COLL, symbol: o.collSymbol, side: "collateral", amount: Math.max(0, r.coll) });
      balances.push({ asset: DEBT, symbol: o.loanSymbol, side: "debt", amount: Math.max(0, r.debt) });
      if (r.ownPrice && r.price > 0) prices.push({ asset: COLL, usd: r.price * G });
      prices.push({ asset: DEBT, usd: G });
    }
    if (roles.lender) {
      balances.push({ asset: SUPPLY, symbol: o.loanSymbol, side: "collateral", amount: Math.max(0, r.supply) });
      prices.push({ asset: SUPPLY, usd: G });
    }
    return {
      id: r.ev.id,
      ts: r.ev.ts,
      block: r.ev.block,
      tick:
        r.ev.kind === "liquidation"
          ? "liquidation"
          : moved.coll && moved.debt
            ? "both"
            : moved.debt
              ? "debt"
              : "collateral",
      legs: r.legs.map((l) =>
        COLL_KEYS.has(l.bucket)
          ? { bucket: l.bucket, usd: l.amount * r.price * G, symbol: o.collSymbol }
          : { bucket: l.bucket, usd: l.amount * G, symbol: o.loanSymbol },
      ),
      tx: r.ev.tx,
      countsTx: r.ev.kind !== "liquidation",
      balances,
      prices,
    };
  });
  const days: FlowDayRow[] = daysFromEvents(
    buckets.map((b) => b.key),
    flowEvents,
  );

  const today = Math.floor(o.now / DAY_S);
  const last = replayed[replayed.length - 1];
  const open = last.coll > DUST || last.debt > DUST || last.supply > DUST;
  const livePrice = o.live?.price != null && o.live.price > 0 ? o.live.price : null;
  const firstDay = Math.floor(replayed[0].ev.ts / DAY_S);
  const endDay = open ? Math.max(today, Math.floor(last.ev.ts / DAY_S) + 1) : Math.floor(last.ev.ts / DAY_S) + 1;

  // Now: the live read where the page has one, else the last row grown at
  // the market's rate.
  const sinceLast = o.now - last.ev.ts;
  const nowColl = open ? (o.live?.coll ?? last.coll) : 0;
  const nowDebt = open ? (o.live?.debt ?? last.debt * grow(rp.borrowRate[replayed.length - 1], sinceLast)) : 0;
  const nowSupply = open ? (o.live?.supply ?? last.supply * grow(rp.supplyRate[replayed.length - 1], sinceLast)) : 0;
  const pricedNow = livePrice ?? last.price;

  // The collateral's oracle price on each day a row priced it, and today's.
  const collObs = new Map<number, number>();
  for (const r of replayed) if (r.ownPrice && r.price > 0) collObs.set(Math.floor(r.ev.ts / DAY_S), r.price * G);
  // Days before the first priced row take its price, as their flows do.
  if (![...collObs.keys()].some((d) => d <= firstDay) && replayed[0].price > 0)
    collObs.set(firstDay, replayed[0].price * G);
  if (livePrice != null && open) collObs.set(today, livePrice * G);
  // The debt's and the supply's price each day: a grain a token, grown at the
  // rate since the last row to the day's end; today's meets the live read.
  const debtObs: [number, number][] = [];
  const supplyObs: [number, number][] = [];
  let ei = 0;
  for (let d = firstDay; d <= endDay; d++) {
    const end = Math.min((d + 1) * DAY_S, o.now);
    while (ei + 1 < replayed.length && replayed[ei + 1].ev.ts <= end) ei++;
    const r = replayed[ei];
    const before = r.ev.ts > end;
    const isNow = d === today && open && ei === replayed.length - 1;
    debtObs.push([
      d,
      before ? G : isNow && r.debt > DUST ? (nowDebt / r.debt) * G : grow(rp.borrowRate[ei], end - r.ev.ts) * G,
    ]);
    supplyObs.push([
      d,
      before ? G : isNow && r.supply > DUST ? (nowSupply / r.supply) * G : grow(rp.supplyRate[ei], end - r.ev.ts) * G,
    ]);
  }

  const assets: NonNullable<FlowTimeline["live"]["assets"]> = [];
  if (open) {
    if (roles.borrower && nowColl > DUST)
      assets.push({ side: "collateral", symbol: o.collSymbol, amount: nowColl, usd: nowColl * pricedNow * G });
    if (roles.lender && nowSupply > DUST)
      assets.push({ side: "collateral", symbol: o.loanSymbol, amount: nowSupply, usd: nowSupply * G });
    if (roles.borrower && nowDebt > DUST)
      assets.push({ side: "debt", symbol: o.loanSymbol, amount: nowDebt, usd: nowDebt * G });
  }

  const dailyPrices: Record<string, [number, number][]> = {};
  if (roles.borrower) {
    dailyPrices[COLL] = [...collObs].sort((a, b) => a[0] - b[0]);
    dailyPrices[DEBT] = debtObs;
  }
  if (roles.lender) dailyPrices[SUPPLY] = supplyObs;

  return {
    unit: { symbol: o.loanSymbol, scale },
    buckets,
    days,
    live: {
      collateralUsd: open ? ((roles.borrower ? nowColl * pricedNow : 0) + (roles.lender ? nowSupply : 0)) * G : 0,
      debtUsd: open && roles.borrower ? nowDebt * G : 0,
      assets,
    },
    todayPrices: {
      ...(roles.borrower ? { [COLL]: pricedNow * G, [DEBT]: G } : {}),
      ...(roles.lender ? { [SUPPLY]: G } : {}),
    },
    dailyPrices,
    seriesCarry: true,
    today: open ? today : endDay,
    labels: {
      collateral: roles.borrower ? (roles.lender ? "Collateral and supply" : "Collateral") : "Supplied",
      debt: "Debt",
    },
    words: morphoFlowWords(o.loanSymbol, o.collSymbol, roles),
  };
}

/** The panel's words for a Morpho position: everything in the loan token. */
export function morphoFlowWords(
  loanSymbol: string,
  collSymbol: string,
  roles: MorphoRoles,
): NonNullable<FlowTimeline["words"]> {
  const collRest = roles.borrower
    ? roles.lender
      ? "Market move and interest since the last event"
      : "Market move"
    : "Interest since the last event";
  const collNote = roles.borrower
    ? roles.lender
      ? `the change in ${collSymbol}'s oracle price since each collateral flow, and the interest the supply earned since the last event`
      : `the change in ${collSymbol}'s oracle price, in ${loanSymbol}, since each flow`
    : "the interest the supply earned at the market's rate since the position's last event";
  const supplyBasis = `the ${loanSymbol} supplied after the last event by then, grown at the rate the market paid until its next event (after the last, its supply rate now).`;
  const collBasis = `the ${collSymbol} held after the last event by then, at the market oracle's price of the latest event that priced it, in ${loanSymbol}.`;
  return {
    held: roles.borrower ? "Still deposited" : "Still supplied",
    restBySide: {
      collateral: collRest,
      ...(roles.borrower ? { debt: "Interest since the last event" } : {}),
    },
    restNote: {
      collateral: collNote,
      debt: "the interest built up on the debt at the market's rate since the position's last event",
    },
    basis: {
      collateral: roles.borrower
        ? `Every figure is in ${loanSymbol}, the market's loan token; each ${collSymbol} flow is converted at the market oracle's price at its block.`
        : `Every figure is in ${loanSymbol}, the market's loan token.`,
      debt: `Every figure is in ${loanSymbol}, the market's loan token.`,
    },
    heldBasis: {
      collateral: roles.borrower ? (roles.lender ? `${collBasis} With it, ${supplyBasis}` : collBasis) : supplyBasis,
      debt: `the ${loanSymbol} owed after the last event by then, grown at the rate the market charged until its next event (after the last, its borrow rate now).`,
    },
    linePrices: roles.borrower
      ? `in ${loanSymbol}, with the collateral at the oracle price of its latest priced event and the debt${roles.lender ? " and the supply" : ""} grown at the market's rate since the last event`
      : `in ${loanSymbol}, with the supply grown at the market's rate since the last event`,
    moment: {
      face: roles.borrower ? ["debt"] : ["collateral"],
      noPrice: {
        collateral: `No oracle price is recorded for this day, so the ${collSymbol} is stated in tokens.`,
      },
      notes: [],
    },
  };
}

/** The rows as the event cards' sums read them (lib/shared/flow-focus.ts):
 *  each row's legs in the model's figures (the loan token in grains) and in
 *  tokens, ascending, the legs the day rows add up. Each side's figure just
 *  before and once the row's transaction had run is the transaction's last
 *  row's balance at that row's price, less the transaction's acts. */
export function morphoFocusEvents(rp: MorphoFlowReplay, loanSymbol: string, collSymbol: string): FocusEvent[] {
  const { replayed, roles, grain: G } = rp;
  const byTx = new Map<string, MorphoReplayed[]>();
  for (const r of replayed) {
    const k = r.ev.tx ?? r.ev.id;
    const list = byTx.get(k);
    if (list) list.push(r);
    else byTx.set(k, [r]);
  }
  // The side the collateral cell states in tokens: the borrower's collateral,
  // or a lender's supply.
  const collIsSupply = !roles.borrower;
  return replayed.map((r, i) => {
    const tx = byTx.get(r.ev.tx ?? r.ev.id) ?? [r];
    const lastOf = tx[tx.length - 1];
    let collMove = 0;
    let debtMove = 0;
    for (const t of tx)
      for (const l of t.legs) {
        if (ACCRUAL_KEYS.has(l.bucket)) continue;
        const sign = OUT_KEYS.has(l.bucket) ? -1 : 1;
        if (collIsSupply ? SUPPLY_KEYS.has(l.bucket) : COLL_KEYS.has(l.bucket)) collMove += sign * l.amount;
        else if (!COLL_KEYS.has(l.bucket) && !SUPPLY_KEYS.has(l.bucket)) debtMove += sign * l.amount;
      }
    const collHeld = Math.max(0, collIsSupply ? lastOf.supply : lastOf.coll);
    const collPrice = collIsSupply ? G : lastOf.price * G;
    const debtHeld = Math.max(0, lastOf.debt);
    const rate = roles.borrower ? rp.borrowRate[i] : rp.supplyRate[i];
    return {
      id: r.ev.id,
      ts: r.ev.ts,
      ...(r.ev.tx ? { tx: r.ev.tx } : {}),
      legs: r.legs.map((l) =>
        COLL_KEYS.has(l.bucket)
          ? { bucket: l.bucket, usd: l.amount * r.price * G, amount: l.amount, symbol: collSymbol }
          : {
              bucket: l.bucket,
              usd: l.amount * G,
              amount: l.amount,
              symbol: loanSymbol,
              ...(ACCRUAL_KEYS.has(l.bucket) ? { accrual: true } : {}),
            },
      ),
      sides: {
        collateral: {
          before: Math.max(0, collHeld - collMove) * collPrice,
          after: collHeld * collPrice,
          amount: collMove,
          symbol: collIsSupply ? loanSymbol : collSymbol,
          held: collHeld,
        },
        debt: {
          before: Math.max(0, debtHeld - debtMove) * G,
          after: debtHeld * G,
          amount: debtMove,
          symbol: loanSymbol,
          held: debtHeld,
        },
      },
      rate: rate * 100,
    };
  });
}

/** How many collateral flows were valued at the nearest priced row's
 *  oracle price. */
export function morphoUnpriced(rp: MorphoFlowReplay): number {
  return rp.replayed.filter((r) => !r.ownPrice && r.legs.some((l) => COLL_KEYS.has(l.bucket))).length;
}
