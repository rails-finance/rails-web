// Lifetime flows for a Compound V2-family account (Compound V2; Moonwell on
// Ethereum and on Base, its forks): the page's rows replayed into the day rows
// the Lifetime flows panel reads (lib/shared/flows-timeline.ts; rails-ops
// reference/lifetime-flows-scrubber.md, "Compound V2").
// ----------------------------------------------------------------------------
// One account holds supplies (cTokens) and borrows on several markets under
// one account liquidity, so the panel is in USD with an asset per market, as
// the Aave family's is. A family adapter maps its rows onto `CTokenFlowRow`
// (lib/compound-v2/flows.ts); everything below is the family's.
//
// Every row states the market's balance just before and after it: the supply
// as cTokens × the market's exchange rate at the row's block, the debt as the
// emitted accountBorrows (interest to that block included) and that less or
// plus the act. So the replay splits every move to the base unit, per market:
//
//     supply before − supply after the market's last row = interest earned
//     supply after − supply before                       = the act (supply,
//                                                          withdraw, transfer,
//                                                          seizure)
//     debt before − debt after the market's last row     = interest accrued
//     debt after − debt before                           = the act (borrow,
//                                                          repay, liquidation)
//
// and each side's lines add to the recorded balances at every row. A row with
// no balance of a side moves nothing on it (a fork's liquidation row whose debt
// move rides the liquidator's RepayBorrow row: the adapter books that row as
// the liquidation).
//
// Between rows a balance grows by its market's index (`FlowIndexes`, basis
// "ctoken-rows"): the supply by the exchange rate the rows state, in a straight
// line from one row to the next; the debt by its growth, each row's debt
// before over the last row's debt after; after the last row, to the live read
// (the market's exchange rate and borrow balance now), else at its rate now.
// Prices: each row's at its block where the page read it, else the nearest
// priced row's on the market; between events the daily store's price for the
// day where the family passes one (Moonwell), else the last price is carried
// (`seriesCarry`); today's is the live read's.
//
// Pure: tested offline in scripts/verify/verify-compound-v2-flows.ts.

import type { LedgerKind } from "@/lib/shared/ctoken-ledger";
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

const DAY_S = 86_400;
const ONE_YEAR_S = 31_557_600;
const DUST = 1e-12;

/** Bucket keys. */
export const CT = {
  supplied: "ct-supplied",
  received: "ct-received",
  seizedIn: "ct-seized-in",
  earned: "ct-earned",
  withdrawn: "ct-withdrawn",
  sent: "ct-sent",
  seized: "ct-seized",
  borrowed: "ct-borrowed",
  accrued: "ct-accrued",
  repaid: "ct-repaid",
  liquidated: "ct-liquidated",
} as const;

const SUPPLY_KEYS = new Set<string>([
  CT.supplied,
  CT.received,
  CT.seizedIn,
  CT.earned,
  CT.withdrawn,
  CT.sent,
  CT.seized,
]);
const OUT_KEYS = new Set<string>([CT.withdrawn, CT.sent, CT.seized, CT.repaid, CT.liquidated]);
const ACCRUAL_KEYS = new Set<string>([CT.earned, CT.accrued]);

/** The family's words: "cToken" / "mToken", and its brand. */
export interface CTokenVocab {
  brand: string;
  receipt: string;
}

/** Every bucket the family can fill, in drawing order. */
export function ctokenFlowBuckets(v: CTokenVocab): FlowBucket[] {
  return [
    { key: CT.supplied, label: "Supplied", event: "Supply", side: "collateral", dir: "in" },
    {
      key: CT.received,
      label: "Received by transfer",
      event: "Transferred in",
      side: "collateral",
      dir: "in",
      hatch: "grid",
    },
    {
      key: CT.seizedIn,
      label: "Seized as liquidator",
      event: "Seized collateral received",
      side: "collateral",
      dir: "in",
      hatch: "checker",
    },
    // Interest is dashed (rails-ops reference/lifetime-flows-scrubber.md): the
    // event's words name none, since it moves on most events.
    { key: CT.earned, label: "Interest earned", event: "", side: "collateral", dir: "in", hatch: "dashes" },
    { key: CT.withdrawn, label: "Withdrawn", event: "Withdraw", side: "collateral", dir: "out" },
    {
      key: CT.sent,
      label: `${v.receipt}s sent`,
      event: "Transferred out",
      side: "collateral",
      dir: "out",
      hatch: "dots",
    },
    {
      key: CT.seized,
      label: "Seized in liquidations",
      event: "Liquidation",
      side: "collateral",
      dir: "out",
      tone: "liquidation",
      hatch: "forward",
      link: "liquidation",
    },
    { key: CT.borrowed, label: "Borrowed", event: "Borrow", side: "debt", dir: "in" },
    { key: CT.accrued, label: "Interest accrued", event: "", side: "debt", dir: "in", hatch: "dashes" },
    { key: CT.repaid, label: "Repaid", event: "Repay", side: "debt", dir: "out" },
    {
      key: CT.liquidated,
      label: "Repaid by liquidators",
      event: "Liquidation",
      side: "debt",
      dir: "out",
      tone: "liquidation",
      hatch: "forward",
      link: "liquidation",
    },
  ];
}

/** One row as the replay reads it: underlying amounts in human units. */
export interface CTokenFlowRow {
  id: string;
  /** Unix seconds. */
  ts: number;
  block: number;
  tx?: string;
  kind: LedgerKind;
  /** The market key, the asset of the model. */
  market: string;
  symbol: string;
  /** The market's supply and debt just before and after the row; null where
   *  the row states none of that side. */
  supplyBefore: number | null;
  supplyAfter: number | null;
  debtBefore: number | null;
  debtAfter: number | null;
  /** Underlying per whole cToken at the row's block (supply rows). */
  exchangeRate: number | null;
  /** The row's own underlying amount, for the checks. */
  amount: number | null;
  /** USD per underlying token at the row's block, where it was read. */
  price: number | null;
  /** Whether the account's owner made the transaction (false: a liquidator,
   *  the sender of a transfer). Default true. */
  byOwner?: boolean;
}

/** What the page's live read states now, per market. */
export interface CTokenLiveMarket {
  supply: number;
  debt: number;
  /** Underlying per whole cToken now. */
  exchangeRate: number | null;
  price: number | null;
  supplyApr: number | null;
  borrowApr: number | null;
}

export interface CTokenFlowOptions {
  vocab: CTokenVocab;
  /** Unix seconds now; the page's clock. */
  now: number;
  /** The live read by market, where the page has one. */
  live: Record<string, CTokenLiveMarket> | null;
  /** Today's oracle price by market, for a market no row priced. */
  todayPrices?: Record<string, number>;
  /** A daily price per market, [UTC day, USD] ascending (the shared daily
   *  price store's, rails-ops reference/daily-prices.md): each day no row
   *  priced takes it, so a quiet market is valued at its day's price. */
  dailyPrices?: Record<string, [number, number][]>;
}

/** A replayed row: its legs in tokens and the market's balances after it. */
export interface CTokenReplayed {
  ev: CTokenFlowRow;
  /** The price the row is valued at, and whether it was the row's own read
   *  (else the nearest priced row's on the market, else today's). */
  price: number;
  ownPrice: boolean;
  legs: { bucket: string; amount: number }[];
  /** The market's supply and debt after the row. */
  supply: number;
  debt: number;
  /** The market's supply index (its exchange rate) and debt index at the row. */
  supplyIndex: number | null;
  debtIndex: number;
}

/** Oldest first: by block, then the row's position within it (the adapter
 *  hands rows in the chain's order). */
function ordered(rows: CTokenFlowRow[]): CTokenFlowRow[] {
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r.block - b.r.block || a.i - b.i)
    .map((x) => x.r);
}

/** The price each row is valued at: its own, else the nearest priced row's
 *  on its market (by time), else today's. */
function pricesFor(
  rows: CTokenFlowRow[],
  todayPrice: (market: string) => number | null,
): { price: number; own: boolean }[] {
  const priced = new Map<string, { ts: number; price: number }[]>();
  for (const r of rows)
    if (r.price != null && r.price > 0) {
      const list = priced.get(r.market) ?? [];
      list.push({ ts: r.ts, price: r.price });
      priced.set(r.market, list);
    }
  return rows.map((r) => {
    if (r.price != null && r.price > 0) return { price: r.price, own: true };
    const list = priced.get(r.market);
    if (list && list.length > 0) {
      let best = list[0];
      for (const p of list) if (Math.abs(p.ts - r.ts) < Math.abs(best.ts - r.ts)) best = p;
      return { price: best.price, own: false };
    }
    return { price: todayPrice(r.market) ?? 0, own: false };
  });
}

/** The per-row replay. */
export function replayCToken(
  rows: CTokenFlowRow[],
  o: Pick<CTokenFlowOptions, "todayPrices" | "live">,
): CTokenReplayed[] {
  const evs = ordered(rows);
  const today = (m: string) => o.live?.[m]?.price ?? o.todayPrices?.[m] ?? null;
  const prices = pricesFor(evs, today);
  const supply = new Map<string, number>();
  const debt = new Map<string, number>();
  const debtIdx = new Map<string, number>();
  const rate = new Map<string, number>();
  return evs.map((ev, i) => {
    const m = ev.market;
    const legs: { bucket: string; amount: number }[] = [];
    const add = (bucket: string, amount: number) => {
      if (Math.abs(amount) > DUST) legs.push({ bucket, amount });
    };
    if (ev.supplyBefore != null && ev.supplyAfter != null) {
      add(CT.earned, ev.supplyBefore - (supply.get(m) ?? 0));
      const act = ev.supplyAfter - ev.supplyBefore;
      switch (ev.kind) {
        case "transfer_in":
          add(CT.received, act);
          break;
        case "seize_in":
          add(CT.seizedIn, act);
          break;
        case "transfer_out":
          add(CT.sent, -act);
          break;
        case "seize_liquidator":
        case "seize_protocol":
          add(CT.seized, -act);
          break;
        default:
          if (act >= 0) add(CT.supplied, act);
          else add(CT.withdrawn, -act);
      }
      supply.set(m, ev.supplyAfter);
      if (ev.exchangeRate != null && ev.exchangeRate > 0) rate.set(m, ev.exchangeRate);
    }
    if (ev.debtBefore != null && ev.debtAfter != null) {
      const last = debt.get(m) ?? 0;
      // The debt's index: its growth from the market's last row to this one.
      const idx = debtIdx.get(m) ?? 1;
      debtIdx.set(m, last > DUST ? (idx * ev.debtBefore) / last : idx);
      add(CT.accrued, ev.debtBefore - last);
      const act = ev.debtAfter - ev.debtBefore;
      if (ev.kind === "liquidation") add(CT.liquidated, -act);
      else if (act >= 0) add(CT.borrowed, act);
      else add(CT.repaid, -act);
      debt.set(m, ev.debtAfter);
    }
    return {
      ev,
      price: prices[i].price,
      ownPrice: prices[i].own,
      legs,
      supply: supply.get(m) ?? 0,
      debt: debt.get(m) ?? 0,
      supplyIndex: rate.get(m) ?? null,
      debtIndex: debtIdx.get(m) ?? 1,
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

/** Each market's supply and debt index knots: one per row that states it,
 *  and now from the live read. */
export interface CTokenIndexes {
  supply: Map<string, Knot[]>;
  debt: Map<string, Knot[]>;
  supplyApr: Map<string, number | null>;
  borrowApr: Map<string, number | null>;
}

export function ctokenIndexes(replayed: CTokenReplayed[], o: Pick<CTokenFlowOptions, "now" | "live">): CTokenIndexes {
  const supply = new Map<string, Knot[]>();
  const debt = new Map<string, Knot[]>();
  const push = (map: Map<string, Knot[]>, m: string, k: Knot) => {
    const list = map.get(m) ?? [];
    list.push(k);
    map.set(m, list);
  };
  const lastSupply = new Map<string, CTokenReplayed>();
  const lastDebt = new Map<string, CTokenReplayed>();
  for (const r of replayed) {
    const m = r.ev.market;
    if (r.ev.supplyAfter != null && r.supplyIndex != null) {
      push(supply, m, [r.ev.ts, r.supplyIndex]);
      lastSupply.set(m, r);
    }
    if (r.ev.debtAfter != null) {
      push(debt, m, [r.ev.ts, r.debtIndex]);
      lastDebt.set(m, r);
    }
  }
  // Now: the live read, where it states the market.
  for (const [m, r] of lastSupply) {
    const l = o.live?.[m];
    if (l?.exchangeRate != null && l.exchangeRate > 0 && o.now > r.ev.ts) push(supply, m, [o.now, l.exchangeRate]);
  }
  for (const [m, r] of lastDebt) {
    const l = o.live?.[m];
    if (l && r.debt > DUST && l.debt > 0 && o.now > r.ev.ts) push(debt, m, [o.now, (r.debtIndex * l.debt) / r.debt]);
  }
  const supplyApr = new Map<string, number | null>();
  const borrowApr = new Map<string, number | null>();
  for (const m of new Set([...supply.keys(), ...debt.keys()])) {
    supplyApr.set(m, o.live?.[m]?.supplyApr ?? null);
    borrowApr.set(m, o.live?.[m]?.borrowApr ?? null);
  }
  return { supply, debt, supplyApr, borrowApr };
}

/** A balance a row recorded, at `ts`: grown by its market's index since. */
export function grownAt(
  ix: CTokenIndexes,
  market: string,
  side: FlowSide,
  recorded: number,
  anchor: number | null,
  ts: number,
): number {
  if (!(recorded > 0) || anchor == null || !(anchor > 0)) return recorded;
  const knots = (side === "collateral" ? ix.supply : ix.debt).get(market) ?? [];
  const apr = (side === "collateral" ? ix.supplyApr : ix.borrowApr).get(market) ?? null;
  const at = indexAt(knots, ts, apr);
  return at != null ? (recorded * at) / anchor : recorded;
}

// ── The timeline ────────────────────────────────────────────────────────────

/** The replay with its indexes, for the timeline, the cards and the tests. */
export interface CTokenFlowReplay {
  replayed: CTokenReplayed[];
  indexes: CTokenIndexes;
  /** Whether any row moved debt: else the panel draws one bar. */
  borrower: boolean;
}

export function ctokenFlowReplay(rows: CTokenFlowRow[], o: CTokenFlowOptions): CTokenFlowReplay {
  const replayed = replayCToken(rows, o);
  return {
    replayed,
    indexes: ctokenIndexes(replayed, o),
    borrower: replayed.some((r) => r.ev.debtAfter != null),
  };
}

/** What is held and owed now per market: the live read where it states the
 *  market, else the last row's balance grown by the index. */
function nowBalances(rp: CTokenFlowReplay, o: CTokenFlowOptions) {
  const last = new Map<string, CTokenReplayed>();
  const lastSupply = new Map<string, CTokenReplayed>();
  const lastDebt = new Map<string, CTokenReplayed>();
  for (const r of rp.replayed) {
    last.set(r.ev.market, r);
    if (r.ev.supplyAfter != null) lastSupply.set(r.ev.market, r);
    if (r.ev.debtAfter != null) lastDebt.set(r.ev.market, r);
  }
  const out: { market: string; symbol: string; supply: number; debt: number }[] = [];
  for (const [m, r] of last) {
    const s = lastSupply.get(m);
    const d = lastDebt.get(m);
    const l = o.live?.[m];
    const supply =
      s && s.supply > DUST
        ? l && l.supply > 0
          ? l.supply
          : grownAt(rp.indexes, m, "collateral", s.supply, s.supplyIndex, o.now)
        : 0;
    const debt =
      d && d.debt > DUST ? (l && l.debt > 0 ? l.debt : grownAt(rp.indexes, m, "debt", d.debt, d.debtIndex, o.now)) : 0;
    out.push({ market: m, symbol: r.ev.symbol, supply, debt });
  }
  return out;
}

/** The account's rows as the Lifetime flows panel's timeline, in USD. Null
 *  with no rows. */
export function ctokenFlowTimeline(rows: CTokenFlowRow[], o: CTokenFlowOptions): FlowTimeline | null {
  if (rows.length === 0) return null;
  const rp = ctokenFlowReplay(rows, o);
  const { replayed } = rp;
  const used = new Set(replayed.flatMap((r) => r.legs.map((l) => l.bucket)));
  // The supply and withdraw lines always; the debt's four where the account
  // borrowed; every other line where a row filled it.
  const base = new Set<string>([CT.supplied, CT.withdrawn, CT.earned]);
  if (rp.borrower) for (const k of [CT.borrowed, CT.accrued, CT.repaid]) base.add(k);
  const buckets = ctokenFlowBuckets(o.vocab).filter((b) => base.has(b.key) || used.has(b.key));

  const flowEvents: FlowEvent[] = replayed.map((r) => {
    const moved = { coll: false, debt: false };
    for (const l of r.legs) {
      if (ACCRUAL_KEYS.has(l.bucket)) continue;
      if (SUPPLY_KEYS.has(l.bucket)) moved.coll = true;
      else moved.debt = true;
    }
    const m = r.ev.market;
    const balances: FlowEvent["balances"] = [];
    if (r.ev.supplyAfter != null)
      balances.push({
        asset: m,
        symbol: r.ev.symbol,
        side: "collateral",
        amount: Math.max(0, r.supply),
        ...(r.supplyIndex != null ? { index: r.supplyIndex } : {}),
      });
    if (r.ev.debtAfter != null)
      balances.push({ asset: m, symbol: r.ev.symbol, side: "debt", amount: Math.max(0, r.debt), index: r.debtIndex });
    const liq = r.ev.kind === "liquidation" || r.ev.kind === "seize_liquidator" || r.ev.kind === "seize_protocol";
    // A row with no price read at its block takes the nearest priced row's
    // on its market, else today's: its figures that day rest on that price.
    const why = r.ownPrice
      ? null
      : "priced at the nearest price read on its market, else today's: the price at this block is not read.";
    const unsure =
      why && r.legs.length > 0 ? balances.map((b) => ({ side: b.side, why, symbol: r.ev.symbol, held: true })) : [];
    return {
      ...(unsure.length ? { unsure } : {}),
      id: r.ev.id,
      ts: r.ev.ts,
      block: r.ev.block,
      tick: liq ? "liquidation" : moved.coll && moved.debt ? "both" : moved.debt ? "debt" : "collateral",
      legs: r.legs.map((l) => ({ bucket: l.bucket, usd: l.amount * r.price, symbol: r.ev.symbol })),
      tx: r.ev.tx,
      countsTx: !liq && r.ev.byOwner !== false,
      balances,
      prices: r.ownPrice && r.price > 0 ? [{ asset: m, usd: r.price }] : [],
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

  // Prices by day: each market's reads at its blocks, the first read standing for the
  // days before it, and today's live price.
  const todayPrice = (m: string) => o.live?.[m]?.price ?? o.todayPrices?.[m] ?? null;
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
    if (r.ownPrice) obs.set(Math.floor(r.ev.ts / DAY_S), r.price);
  }
  // The days before a market's first read take the price its first row is
  // valued at, as its flows do.
  for (const [m, obs] of byMarket) {
    const d0 = firstDayOf.get(m)!;
    const p0 = firstPriceOf.get(m);
    if (p0 != null && ![...obs.keys()].some((d) => d <= d0)) obs.set(d0, p0);
  }
  // The daily store's prices, where the family has them: a day a row priced
  // keeps the row's (the cards and the bars agree on an event's day).
  for (const [m, obs] of byMarket) {
    const rowDays = new Set(obs.keys());
    for (const [d, p] of o.dailyPrices?.[m] ?? []) if (p > 0 && !rowDays.has(d) && d < today) obs.set(d, p);
  }
  for (const [m, obs] of byMarket) {
    const p = todayPrice(m);
    if (open && p != null && p > 0) obs.set(today, p);
    dailyPrices[m] = [...obs].sort((a, b) => a[0] - b[0]);
  }

  // Each market's indexes at each day's close, from its first row to the end.
  const indexes: FlowIndexes = { basis: "ctoken-rows", assets: {} };
  for (const m of byMarket.keys()) {
    const sKnots = rp.indexes.supply.get(m) ?? [];
    const dKnots = rp.indexes.debt.get(m) ?? [];
    if (sKnots.length === 0 && dKnots.length === 0) continue;
    const list: [number, number | null, number | null][] = [];
    for (let d = firstDayOf.get(m)!; d <= endDay; d++) {
      const close = Math.min((d + 1) * DAY_S, o.now);
      list.push([
        d,
        indexAt(sKnots, close, rp.indexes.supplyApr.get(m) ?? null),
        indexAt(dKnots, close, rp.indexes.borrowApr.get(m) ?? null),
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
    // A market the store did not answer for keeps its last read between rows.
    carriedWhy: Object.fromEntries(
      [...byMarket.keys()]
        .filter((m) => !o.dailyPrices?.[m]?.length)
        .map((m) => [m, "no daily price is stored for this market, so a day between rows keeps the last row's price."]),
    ),
    indexes,
    today: open ? today : endDay,
    words: ctokenFlowWords(o.vocab, rp.borrower),
  };
}

/** The panel's words for a Compound V2-family account. */
export function ctokenFlowWords(v: CTokenVocab, borrower: boolean): FlowWords {
  return {
    held: "Still supplied",
    restBySide: {
      collateral: "Market move and interest since the last event",
      ...(borrower ? { debt: "Market move and interest since the last event" } : {}),
    },
    restNote: {
      collateral: `the change in each market's ${v.brand} oracle price since its flows, and the interest each supply earned since its market's last event`,
      debt: `the change in each borrowed asset's ${v.brand} oracle price since its flows, and the interest each borrow built since its market's last event`,
    },
    basis: {
      collateral: `Each flow is valued at ${v.brand}'s oracle price for its market at its block.`,
      debt: `Each flow is valued at ${v.brand}'s oracle price for its market at its block.`,
    },
    heldBasis: {
      collateral: `each market's supply after its last event by then, grown by the exchange rate (in a straight line between the rows that state it, then to today's), at the price of its latest priced event.`,
      debt: `each market's debt after its last event by then, grown as the debt grew until the market's next event (after the last, to today's live read), at the price of its latest priced event.`,
    },
    linePrices: `at each market's oracle price of its latest priced event, with the balances grown by their markets' interest since the last event`,
    moment: {
      noPrice: {
        collateral: `No ${v.brand} oracle price is recorded for this day, so each market is stated in tokens.`,
        debt: `No ${v.brand} oracle price is recorded for this day, so each market is stated in tokens.`,
      },
      notes: [],
    },
  };
}

// ── The cards ───────────────────────────────────────────────────────────────

/** The rows as the event cards' sums read them (lib/shared/flow-focus.ts):
 *  each row's legs in USD at the row's price and in tokens, ascending; the
 *  interest legs are accruals, not the event's act. */
export function ctokenFocusEvents(rp: CTokenFlowReplay): FocusEvent[] {
  return rp.replayed.map((r) => ({
    id: r.ev.id,
    ts: r.ev.ts,
    ...(r.ev.tx ? { tx: r.ev.tx } : {}),
    legs: r.legs.map((l) => ({
      bucket: l.bucket,
      usd: l.amount * r.price,
      amount: l.amount,
      symbol: r.ev.symbol,
      ...(ACCRUAL_KEYS.has(l.bucket) ? { accrual: true } : {}),
    })),
  }));
}

/** The account once an event's transaction had run, by side: each asset in
 *  tokens (the markets the transaction touched as their rows recorded them,
 *  the others grown by their index to the block) and at the price then, the
 *  side's USD, and whether the transaction moved the side. */
export interface CTokenEventState {
  balances: Record<FlowSide, AssetBalance[]>;
  held: Record<FlowSide, number | null>;
  heldBefore: Record<FlowSide, number | null>;
  moved: Record<FlowSide, boolean>;
}

export function ctokenEventStates(
  rp: CTokenFlowReplay,
  o: Pick<CTokenFlowOptions, "todayPrices" | "live" | "dailyPrices">,
): Map<string, CTokenEventState> {
  const out = new Map<string, CTokenEventState>();
  const { replayed, indexes } = rp;
  // Per market: the balance each side recorded last, its index then, and the
  // latest price read (and its day).
  const rec = new Map<string, { symbol: string; s: number; sIdx: number | null; d: number; dIdx: number }>();
  const lastPrice = new Map<string, { usd: number; day: number }>();
  const firstPrice = new Map<string, number>();
  for (const r of replayed) if (r.price > 0 && !firstPrice.has(r.ev.market)) firstPrice.set(r.ev.market, r.price);
  // A market the transaction left alone takes the newer of its latest row's
  // price and the daily store's for the event's day, as the bars do that day.
  const storeAt = (m: string, day: number): { usd: number; day: number } | null => {
    const obs = o.dailyPrices?.[m];
    if (!obs || obs.length === 0 || obs[0][0] > day) return null;
    let lo = 0;
    let hi = obs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (obs[mid][0] <= day) lo = mid;
      else hi = mid - 1;
    }
    return obs[lo][1] > 0 ? { usd: obs[lo][1], day: obs[lo][0] } : null;
  };
  const priceOf = (m: string, day: number) => {
    const row = lastPrice.get(m);
    const store = storeAt(m, day);
    if (store && (!row || store.day > row.day)) return store.usd;
    return row?.usd ?? firstPrice.get(m) ?? o.live?.[m]?.price ?? o.todayPrices?.[m] ?? null;
  };
  let i = 0;
  while (i < replayed.length) {
    const tx = replayed[i].ev.tx ?? replayed[i].ev.id;
    let j = i;
    while (j + 1 < replayed.length && (replayed[j + 1].ev.tx ?? replayed[j + 1].ev.id) === tx) j++;
    // Before the transaction: each touched market's balance before its first
    // row in it (interest to the block included).
    const before = new Map<string, { s: number | null; d: number | null }>();
    const moved = { collateral: false, debt: false };
    for (let k = i; k <= j; k++) {
      const r = replayed[k];
      const b = before.get(r.ev.market) ?? { s: null, d: null };
      if (r.ev.supplyBefore != null && b.s == null) b.s = r.ev.supplyBefore;
      if (r.ev.debtBefore != null && b.d == null) b.d = r.ev.debtBefore;
      before.set(r.ev.market, b);
      for (const l of r.legs) {
        if (ACCRUAL_KEYS.has(l.bucket)) continue;
        if (SUPPLY_KEYS.has(l.bucket)) moved.collateral = true;
        else moved.debt = true;
      }
      const cur = rec.get(r.ev.market) ?? { symbol: r.ev.symbol, s: 0, sIdx: null, d: 0, dIdx: 1 };
      if (r.ev.supplyAfter != null) {
        cur.s = r.supply;
        cur.sIdx = r.supplyIndex;
      }
      if (r.ev.debtAfter != null) {
        cur.d = r.debt;
        cur.dIdx = r.debtIndex;
      }
      rec.set(r.ev.market, cur);
      if (r.ownPrice && r.price > 0) lastPrice.set(r.ev.market, { usd: r.price, day: Math.floor(r.ev.ts / DAY_S) });
    }
    const ts = replayed[j].ev.ts;
    const day = Math.floor(ts / DAY_S);
    const bySym: Record<FlowSide, Map<string, AssetBalance>> = { collateral: new Map(), debt: new Map() };
    const usd: Record<FlowSide, number | null> = { collateral: 0, debt: 0 };
    const usdBefore: Record<FlowSide, number | null> = { collateral: 0, debt: 0 };
    for (const [m, c] of rec) {
      const p = priceOf(m, day);
      const touched = before.get(m);
      // A side the transaction moved stands as its rows recorded it; one it
      // left alone, grown by its index to the block, the same before and after.
      const pair = (prior: number | null | undefined, recorded: number, side: FlowSide, idx: number | null) => {
        const after = prior != null ? recorded : grownAt(indexes, m, side, recorded, idx, ts);
        return [side, after, prior ?? after] as [FlowSide, number, number];
      };
      const sides = [pair(touched?.s, c.s, "collateral", c.sIdx), pair(touched?.d, c.d, "debt", c.dIdx)];
      for (const [side, after, prior] of sides) {
        if (!(after > DUST) && !(prior > DUST)) continue;
        const b = bySym[side].get(c.symbol) ?? { symbol: c.symbol, amount: 0, before: 0, price: p };
        b.amount += Math.max(0, after);
        b.before += Math.max(0, prior);
        if (b.price == null) b.price = p;
        bySym[side].set(c.symbol, b);
        const add = (into: Record<FlowSide, number | null>, v: number) => {
          if (v <= DUST) return;
          into[side] = p == null || into[side] == null ? null : (into[side] as number) + v * p;
        };
        add(usd, after);
        add(usdBefore, prior);
      }
    }
    const state: CTokenEventState = {
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

/** How many rows with a flow took the nearest priced row's price (or
 *  today's), and how many their own block's. */
export function ctokenPricing(rp: CTokenFlowReplay): { own: number; nearest: number } {
  let own = 0;
  let nearest = 0;
  for (const r of rp.replayed) {
    if (!r.legs.some((l) => !ACCRUAL_KEYS.has(l.bucket))) continue;
    if (r.ownPrice) own++;
    else nearest++;
  }
  return { own, nearest };
}

/** The leg's sign in its side's sum: an outflow subtracts. */
export const ctokenLegSign = (bucket: string): 1 | -1 => (OUT_KEYS.has(bucket) ? -1 : 1);
export const isCTokenSupplyBucket = (bucket: string): boolean => SUPPLY_KEYS.has(bucket);
