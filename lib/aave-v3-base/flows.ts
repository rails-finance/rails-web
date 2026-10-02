// Lifetime flows for an Aave V3 Pool account on Base (Aave V3 on Base, and
// Seamless, a fork of it): the page's rows replayed into the day rows the
// Lifetime flows panel reads (lib/shared/flows-timeline.ts; rails-ops
// reference/lifetime-flows-scrubber.md, "Aave V3 on Base and Seamless").
// ----------------------------------------------------------------------------
// The legs are the Ethereum explorer's (`aaveV3FlowLegs`, its buckets), so a
// Base page draws the lines an Ethereum page draws. Two things are Base's:
//
// - INTEREST AS ITS OWN LINES. Every row states its reserve's balance just
//   before and after it, as the aToken and the variable debt token held it
//   (`balanceBasis: "chain"`: the scaled balance × the reserve's index at the
//   block). So per reserve and side the replay splits every move:
//
//       balance before − balance after the reserve's last row = interest
//       balance after − balance before                      = the row's act
//
//   and each side's lines add to the recorded balances at every row. A row
//   that states no balance of a side moves it by its legs.
//
// - LIQUIDATIONS PAID IN aTOKENS. Where the liquidator takes aTokens
//   (receiveAToken), the Pool moves them with a BalanceTransfer the index
//   serves as a transfer out to the liquidator, beside the LiquidationCall:
//   that transfer is the seizure the liquidation row already counts, so it
//   adds no leg. The transfer of the liquidation's collateral to the
//   protocol's treasury in the same transaction is the protocol fee, counted
//   as Liquidated as on Ethereum. A liquidation row's balances stand only
//   where its balance before meets what the rows before it left (on a
//   liquidation paid in aTokens the index states figures that do not); else
//   its legs move the balance, as on a row that states none.
//
// - A balance its rows do not state cannot go below zero: where a repay made
//   with aTokens burns more than the last row left, the difference is the
//   interest earned since, booked as such.
//
// Between rows a balance grows by its reserve's index as the rows imply it
// (`FlowIndexes`, basis "aave-rows"): each row's balance before it over the
// balance after the reserve's row before, in a straight line between two
// rows; after the last row, to the Pool's balance now. Prices: each row's
// oracle price at its block where the index stored one, else the daily
// store's price for the event's day, else the nearest priced row's; between
// events the daily store's (`dailyPrices`), else the last event's is carried.
//
// Pure: tested offline in scripts/verify/verify-aave-v3-base-flows.ts.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isAaveV3Event } from "@/lib/shared/types/event-shape";
import type { AaveV3Context } from "@/lib/shared/types/protocols/aave-v3";
import type { FocusEvent } from "@/lib/shared/flow-focus";
import {
  daysFromEvents,
  type FlowBucket,
  type FlowEvent,
  type FlowIndexes,
  type FlowLive,
  type FlowSide,
  type FlowTimeline,
  type FlowWords,
} from "@/lib/shared/flows-timeline";
import { aaveV3EventLegs, aaveV3LiquidationTxs } from "@/lib/aave-v3/chain-truth-tower";
import {
  AAVE_V3_FLOW_BUCKETS,
  AAVE_V3_NOT_COUNTED,
  aaveV3LegBucket,
  countsTx,
  withATokenRepayLeg,
} from "@/lib/aave-v3/flows-timeline";

const DAY_S = 86_400;
const DUST = 1e-12;

/** The interest lines' bucket keys. */
export const INTEREST_EARNED = "interestEarned";
export const INTEREST_ACCRUED = "interestAccrued";
const ACCRUAL_KEYS = new Set<string>([INTEREST_EARNED, INTEREST_ACCRUED]);

/** Aave V3's buckets with the interest lines, dashed, each after its side's
 *  first inflow. */
export const AAVE_V3_BASE_FLOW_BUCKETS: FlowBucket[] = (() => {
  const out: FlowBucket[] = [];
  for (const b of AAVE_V3_FLOW_BUCKETS) {
    out.push(b);
    if (b.key === "swappedIn")
      out.push({
        key: INTEREST_EARNED,
        label: "Interest earned",
        event: "",
        side: "collateral",
        dir: "in",
        hatch: "dashes",
      });
    if (b.key === "borrowed")
      out.push({
        key: INTEREST_ACCRUED,
        label: "Interest accrued",
        event: "",
        side: "debt",
        dir: "in",
        hatch: "dashes",
      });
  }
  return out;
})();

const BUCKET = new Map(AAVE_V3_BASE_FLOW_BUCKETS.map((b) => [b.key, b]));
const sideOf = (bucket: string): FlowSide => BUCKET.get(bucket)?.side ?? "collateral";
const signOf = (bucket: string): 1 | -1 => (BUCKET.get(bucket)?.dir === "in" ? 1 : -1);

type V3Event = BaseActivityEvent & { context: { protocol: "aave-v3"; data: AaveV3Context } };

/** Where a figure's price came from. */
export type AaveBasePriceBasis = "block" | "day" | "nearest" | "today" | "none";

export interface AaveBaseLeg {
  bucket: string;
  side: FlowSide;
  asset: string;
  symbol: string;
  /** Token units, unsigned. */
  amount: number;
  /** USD per token, and where it came from. */
  price: number;
  basis: AaveBasePriceBasis;
}

/** A balance a row states: before (where it states one) and after. */
export interface AaveBaseStated {
  side: FlowSide;
  asset: string;
  symbol: string;
  before: number | null;
  after: number;
  /** The side's index as the rows imply it, at the row. */
  index: number;
}

export interface AaveBaseReplayed {
  ev: V3Event;
  tx: string;
  legs: AaveBaseLeg[];
  stated: AaveBaseStated[];
  /** Balances once the row had run, every reserve and side it touched. */
  after: { side: FlowSide; asset: string; symbol: string; amount: number; index: number }[];
  /** The at-block prices the row carries. */
  prices: { asset: string; usd: number }[];
  /** A liquidation's collateral paid in aTokens to the liquidator (the
   *  seizure's transfer: no leg). */
  seizureTransfer: boolean;
  /** The transfer of a liquidation's collateral to the treasury. */
  treasuryFee: boolean;
}

export interface AaveBaseLiveReserve {
  supply: number;
  debt: number;
}

export interface AaveBaseFlowOptions {
  /** Unix seconds: the end of the line. */
  now: number;
  /** The Pool's balances now, by lowercase reserve; null where the read did
   *  not land. */
  live: Record<string, AaveBaseLiveReserve> | null;
  /** The oracle's price now, by lowercase reserve. */
  todayPrices: Record<string, number>;
  /** The daily store's series by lowercase reserve, where it answered. */
  dailyPrices?: Record<string, [number, number][]>;
  /** The Pool's own words: "Aave" or "Seamless". */
  brand: string;
  /** The block of the Pool's first DeficitCreated, where the Pool writes off
   *  debt the history does not read (Aave V3 on Base); null where it does not. */
  writeOffFrom: number | null;
  /** Actions the position card's transaction count leaves out. */
  notCounted?: readonly string[];
}

const num = (s: string | undefined | null): number | null => {
  if (s == null || s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const logIndex = (id: string): number => {
  const cut = Math.max(id.lastIndexOf(":"), id.lastIndexOf("-"));
  const n = Number(id.slice(cut + 1));
  return Number.isFinite(n) ? n : 0;
};

const txOf = (ev: BaseActivityEvent): string => {
  if (ev.txHash) return ev.txHash.toLowerCase();
  const cut = Math.max(ev.id.lastIndexOf(":"), ev.id.lastIndexOf("-"));
  return (cut > 0 ? ev.id.slice(0, cut) : ev.id).toLowerCase();
};

/** The page's Aave events, oldest first. */
export function orderedAaveEvents(events: readonly BaseActivityEvent[]): V3Event[] {
  return (events.filter(isAaveV3Event) as V3Event[]).sort(
    (a, b) => a.timestamp - b.timestamp || a.blockNumber - b.blockNumber || logIndex(a.id) - logIndex(b.id),
  );
}

/** Each reserve's address by its symbol, from every event that names both. */
function addressBook(ordered: V3Event[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const ev of ordered) {
    const c = ev.context.data;
    for (const f of ev.flows) if (f.token && f.tokenSymbol) out.set(f.tokenSymbol, f.token.toLowerCase());
    if (c.reserve && c.reserveSymbol) out.set(c.reserveSymbol, c.reserve.toLowerCase());
    if (c.collateralAsset && c.collateralSymbol) out.set(c.collateralSymbol, c.collateralAsset.toLowerCase());
    if (c.swap?.receivedAsset && c.swap.receivedSymbol)
      out.set(c.swap.receivedSymbol, c.swap.receivedAsset.toLowerCase());
  }
  return out;
}

/** The balances a row states, by side and reserve. */
function statedOf(ev: V3Event, book: Map<string, string>): Omit<AaveBaseStated, "index">[] {
  const c = ev.context.data;
  const isLiq = c.eventType === "liquidation";
  const out: Omit<AaveBaseStated, "index">[] = [];
  const own = (
    c.reserve ??
    ev.flows[0]?.token ??
    (c.reserveSymbol ? book.get(c.reserveSymbol) : undefined)
  )?.toLowerCase();
  const coll = isLiq
    ? (c.collateralAsset ?? (c.collateralSymbol ? book.get(c.collateralSymbol) : undefined))?.toLowerCase()
    : own;
  const collSym = isLiq ? c.collateralSymbol : c.reserveSymbol;
  const after = num(c.supplyAfter);
  if (coll && collSym && after != null)
    out.push({ side: "collateral", asset: coll, symbol: collSym, before: num(c.supplyBefore), after });
  const dAfter = num(c.debtAfter);
  if (own && c.reserveSymbol && dAfter != null)
    out.push({ side: "debt", asset: own, symbol: c.reserveSymbol, before: num(c.debtBefore), after: dAfter });
  const s = c.swap;
  const rAsset = s?.receivedAsset?.toLowerCase();
  if (s && rAsset && s.receivedSymbol) {
    const ra = num(s.receivedSupplyAfter);
    if (ra != null)
      out.push({
        side: "collateral",
        asset: rAsset,
        symbol: s.receivedSymbol,
        before: num(s.receivedSupplyBefore),
        after: ra,
      });
    const rd = num(s.receivedDebtAfter);
    if (rd != null)
      out.push({ side: "debt", asset: rAsset, symbol: s.receivedSymbol, before: num(s.receivedDebtBefore), after: rd });
  }
  return out;
}

/** The at-block prices a row carries, by reserve. */
function pricesOf(ev: V3Event, book: Map<string, string>): Map<string, number> {
  const c = ev.context.data;
  const out = new Map<string, number>();
  const put = (asset: string | undefined, usd: number | undefined) => {
    if (asset && usd != null && usd > 0) out.set(asset.toLowerCase(), usd);
  };
  const own = c.reserve ?? ev.flows[0]?.token ?? (c.reserveSymbol ? book.get(c.reserveSymbol) : undefined);
  if (c.eventType === "liquidation") {
    put(c.collateralAsset ?? (c.collateralSymbol ? book.get(c.collateralSymbol) : undefined), c.collateralPrice?.usd);
    put(own, c.debtPrice?.usd);
  } else put(own, c.price?.usd);
  if (c.swap) put(c.swap.receivedAsset, c.swap.receivedPrice?.usd);
  return out;
}

/** A reserve's store price for `day`: the last at or before it. */
function storeAt(obs: [number, number][] | undefined, day: number): number | null {
  if (!obs || obs.length === 0 || obs[0][0] > day) return null;
  let lo = 0;
  let hi = obs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (obs[mid][0] <= day) lo = mid;
    else hi = mid - 1;
  }
  return obs[lo][1] > 0 ? obs[lo][1] : null;
}

/** The replay: each row's legs (interest included), the balances it states
 *  and those it leaves, in order. */
export interface AaveBaseReplay {
  replayed: AaveBaseReplayed[];
  /** Per `${side}:${asset}`: the index knots [ts, index], and now's. */
  knots: Map<string, [number, number][]>;
  /** Whether any row moved debt: else the panel draws one bar. */
  borrower: boolean;
  /** Per reserve: its symbol. */
  symbols: Map<string, string>;
  /** Balances after the last row, per `${side}:${asset}`. */
  last: Map<string, { amount: number; index: number; ts: number }>;
  /** Debt the Pool wrote off that no row states, per reserve, in tokens. */
  writtenOff: { asset: string; symbol: string; amount: number }[];
}

export function aaveBaseReplay(events: readonly BaseActivityEvent[], o: AaveBaseFlowOptions): AaveBaseReplay {
  const ordered = orderedAaveEvents(events);
  const book = addressBook(ordered);
  const symbols = new Map<string, string>();
  for (const [sym, a] of book) symbols.set(a, sym);
  const liqTxs = aaveV3LiquidationTxs(ordered);
  // Per liquidation transaction: its collateral reserves and liquidators.
  const liqOf = new Map<string, { coll: Set<string>; liquidators: Set<string> }>();
  for (const ev of ordered) {
    const c = ev.context.data;
    if (c.eventType !== "liquidation") continue;
    const t = txOf(ev);
    const e = liqOf.get(t) ?? { coll: new Set<string>(), liquidators: new Set<string>() };
    const coll = c.collateralAsset ?? (c.collateralSymbol ? book.get(c.collateralSymbol) : undefined);
    if (coll) e.coll.add(coll.toLowerCase());
    if (c.liquidator) e.liquidators.add(c.liquidator.toLowerCase());
    liqOf.set(t, e);
  }
  // Each reserve's base unit, for the tolerance a balance is read to.
  const unit = new Map<string, number>();
  for (const ev of ordered)
    for (const f of ev.flows)
      if (f.token && f.tokenDecimals != null) unit.set(f.token.toLowerCase(), 10 ** -f.tokenDecimals);
  const tolOf = (asset: string, v: number) => Math.max(3 * (unit.get(asset) ?? 1e-18), 1e-9 * Math.abs(v));

  // Prices: at the block, by reserve and time, for the nearest-row fallback.
  const priced = new Map<string, [number, number][]>();
  const rowPrices = ordered.map((ev) => {
    const p = pricesOf(ev, book);
    for (const [a, usd] of p) {
      const list = priced.get(a) ?? [];
      list.push([ev.timestamp, usd]);
      priced.set(a, list);
    }
    return p;
  });
  const nearest = (asset: string, ts: number): number | null => {
    const list = priced.get(asset);
    if (!list || list.length === 0) return null;
    let best = list[0];
    for (const p of list) if (Math.abs(p[0] - ts) < Math.abs(best[0] - ts)) best = p;
    return best[1];
  };
  const priceFor = (
    asset: string,
    ev: V3Event,
    own: Map<string, number>,
    legPrice?: number,
  ): { price: number; basis: AaveBasePriceBasis } => {
    if (legPrice != null && legPrice > 0) return { price: legPrice, basis: "block" };
    const at = own.get(asset);
    if (at != null) return { price: at, basis: "block" };
    const day = storeAt(o.dailyPrices?.[asset], Math.floor(ev.timestamp / DAY_S));
    if (day != null) return { price: day, basis: "day" };
    const near = nearest(asset, ev.timestamp);
    if (near != null) return { price: near, basis: "nearest" };
    const today = o.todayPrices[asset];
    if (today != null && today > 0) return { price: today, basis: "today" };
    return { price: 0, basis: "none" };
  };

  const running = new Map<string, { amount: number; index: number; ts: number }>();
  /** `${tx}:${reserve}` of each seizure paid by an aToken transfer. */
  const seizedByTransfer = new Set<string>();
  const knots = new Map<string, [number, number][]>();
  const replayed: AaveBaseReplayed[] = [];
  let borrower = false;
  ordered.forEach((ev, i) => {
    const c = ev.context.data;
    const t = txOf(ev);
    const own = rowPrices[i];
    const liq = liqOf.get(t);
    const ownAsset = (c.reserve ?? ev.flows[0]?.token)?.toLowerCase();
    const counterparty = c.counterparty?.toLowerCase();
    const seizureTransfer =
      c.eventType === "transfer_out" &&
      !!liq &&
      !!ownAsset &&
      liq.coll.has(ownAsset) &&
      !!counterparty &&
      liq.liquidators.has(counterparty);
    const treasuryFee =
      c.eventType === "transfer_out" &&
      !!liq &&
      !!ownAsset &&
      liq.coll.has(ownAsset) &&
      !seizureTransfer &&
      liqTxs.has(t);
    // The classifier's legs; a treasury fee is the liquidation's collateral.
    let classified = withATokenRepayLeg(ev, aaveV3EventLegs(ev, liqTxs));
    if (seizureTransfer && ownAsset) seizedByTransfer.add(`${t}:${ownAsset}`);
    if (seizureTransfer) classified = [];
    else if (treasuryFee)
      classified = classified.map((l) => ({ ...l, leg: "liquidatedCollateral" as const, treasuryFee: true as const }));
    const legs: AaveBaseLeg[] = [];
    for (const l of classified) {
      const bucket = aaveV3LegBucket(l);
      if (!bucket || !(l.amount > 0) || !Number.isFinite(l.amount)) continue;
      const asset = (l.address ?? book.get(l.symbol))?.toLowerCase();
      if (!asset) continue;
      const p = priceFor(asset, ev, own, l.price);
      legs.push({
        bucket,
        side: sideOf(bucket),
        asset,
        symbol: l.symbol,
        amount: l.amount,
        price: p.price,
        basis: p.basis,
      });
    }
    // The balances the row states; a liquidation's where its balance before
    // falls short of what the rows before it left is left out.
    const stated: AaveBaseStated[] = [];
    const statedKeys = new Set<string>();
    for (const s of statedOf(ev, book)) {
      const key = `${s.side}:${s.asset}`;
      const prev = running.get(key);
      if (
        c.eventType === "liquidation" &&
        prev &&
        (s.before == null || s.before < prev.amount - tolOf(s.asset, prev.amount))
      )
        continue;
      let index = prev?.index ?? 1;
      if (prev && s.before != null && prev.amount > 0 && s.before > prev.amount)
        index = (index * s.before) / prev.amount;
      // Interest: the balance just before the row less what the last row left.
      if (prev && s.before != null) {
        const gain = s.before - prev.amount;
        if (gain > 0.5 * (unit.get(s.asset) ?? 1e-18)) {
          const bucket = s.side === "collateral" ? INTEREST_EARNED : INTEREST_ACCRUED;
          const p = priceFor(s.asset, ev, own);
          legs.push({
            bucket,
            side: s.side,
            asset: s.asset,
            symbol: s.symbol,
            amount: gain,
            price: p.price,
            basis: p.basis,
          });
        }
      }
      stated.push({ ...s, index });
      statedKeys.add(key);
      running.set(key, { amount: s.after, index, ts: ev.timestamp });
      const list = knots.get(key) ?? [];
      list.push([ev.timestamp, index]);
      knots.set(key, list);
      if (!symbols.has(s.asset)) symbols.set(s.asset, s.symbol);
    }
    // A balance the row does not state follows its legs; one they would take
    // below zero had earned that much since its last row.
    for (const l of [...legs]) {
      if (ACCRUAL_KEYS.has(l.bucket)) continue;
      const key = `${l.side}:${l.asset}`;
      if (statedKeys.has(key)) continue;
      // A seizure the liquidator took as aTokens: its transfer row already
      // moved the balance.
      if (l.bucket === "liquidatedCollateral" && seizedByTransfer.has(`${t}:${l.asset}`)) continue;
      const prev = running.get(key);
      let next = (prev?.amount ?? 0) + signOf(l.bucket) * l.amount;
      let index = prev?.index ?? 1;
      if (next < 0 && prev && prev.amount > DUST) {
        const gain = -next;
        if (gain > tolOf(l.asset, l.amount)) {
          const p = priceFor(l.asset, ev, own);
          legs.push({
            bucket: l.side === "collateral" ? INTEREST_EARNED : INTEREST_ACCRUED,
            side: l.side,
            asset: l.asset,
            symbol: l.symbol,
            amount: gain,
            price: p.price,
            basis: p.basis,
          });
          index = (index * (prev.amount + gain)) / prev.amount;
          const list = knots.get(key) ?? [];
          list.push([ev.timestamp, index]);
          knots.set(key, list);
        }
        next = 0;
      }
      running.set(key, { amount: Math.max(0, next), index, ts: ev.timestamp });
    }
    if (
      legs.some((l) => l.side === "debt") ||
      stated.some((s) => s.side === "debt" && (s.after > DUST || (s.before ?? 0) > DUST))
    )
      borrower = true;
    const touched = new Set([...legs.map((l) => `${l.side}:${l.asset}`), ...statedKeys]);
    const after = [...touched].flatMap((key) => {
      const r = running.get(key);
      if (!r) return [];
      const side = key.slice(0, key.indexOf(":")) as FlowSide;
      const asset = key.slice(key.indexOf(":") + 1);
      return [{ side, asset, symbol: symbols.get(asset) ?? asset.slice(0, 8), amount: r.amount, index: r.index }];
    });
    replayed.push({
      ev,
      tx: t,
      legs,
      stated,
      after,
      prices: [...own].map(([asset, usd]) => ({ asset, usd })),
      seizureTransfer,
      treasuryFee,
    });
  });

  // Now: each side's index grown to the Pool's balance, where the Pool holds
  // the reserve; debt the Pool no longer holds after a liquidation since the
  // first write-off is the Pool's write-off.
  const writtenOff: AaveBaseReplay["writtenOff"] = [];
  const liquidatedSince =
    o.writeOffFrom != null &&
    ordered.some((e) => e.context.data.eventType === "liquidation" && e.blockNumber >= (o.writeOffFrom as number));
  for (const [key, r] of running) {
    const side = key.slice(0, key.indexOf(":")) as FlowSide;
    const asset = key.slice(key.indexOf(":") + 1);
    const l = o.live?.[asset];
    const liveAmt = l ? (side === "collateral" ? l.supply : l.debt) : null;
    if (liveAmt != null && liveAmt > 0 && r.amount > DUST && o.now > r.ts) {
      const list = knots.get(key) ?? [];
      list.push([o.now, (r.index * liveAmt) / r.amount]);
      knots.set(key, list);
    }
    if (side === "debt" && liquidatedSince && o.live && r.amount > DUST && (liveAmt ?? 0) <= 0)
      writtenOff.push({ asset, symbol: symbols.get(asset) ?? asset.slice(0, 8), amount: r.amount });
  }
  return { replayed, knots, borrower, symbols, last: running, writtenOff };
}

/** A side's index at `ts`: a straight line between the knots, flat before the
 *  first and after the last. */
function indexAt(knots: [number, number][] | undefined, ts: number): number | null {
  if (!knots || knots.length === 0) return null;
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
  if (!next) return i0;
  const [t1, i1] = next;
  return t1 > t0 ? i0 + ((i1 - i0) * (ts - t0)) / (t1 - t0) : i1;
}

/** A balance a row recorded with `anchor`, grown by its side's index to `ts`. */
export function aaveBaseGrownAt(
  rp: AaveBaseReplay,
  side: FlowSide,
  asset: string,
  recorded: number,
  anchor: number,
  ts: number,
): number {
  if (!(recorded > 0) || !(anchor > 0)) return recorded;
  const at = indexAt(rp.knots.get(`${side}:${asset}`), ts);
  return at != null ? (recorded * at) / anchor : recorded;
}

/** What is held and owed now per reserve: the Pool's balance where the read
 *  landed, else the last row's grown by the index. */
function nowBalances(rp: AaveBaseReplay, o: AaveBaseFlowOptions) {
  const out = new Map<string, { asset: string; symbol: string; supply: number; debt: number }>();
  const get = (asset: string) => {
    let r = out.get(asset);
    if (!r) {
      r = { asset, symbol: rp.symbols.get(asset) ?? asset.slice(0, 8), supply: 0, debt: 0 };
      out.set(asset, r);
    }
    return r;
  };
  if (o.live)
    for (const [asset, l] of Object.entries(o.live)) {
      if (l.supply > DUST) get(asset).supply = l.supply;
      if (l.debt > DUST) get(asset).debt = l.debt;
    }
  else
    for (const [key, r] of rp.last) {
      if (!(r.amount > DUST)) continue;
      const side = key.slice(0, key.indexOf(":")) as FlowSide;
      const asset = key.slice(key.indexOf(":") + 1);
      const grown = aaveBaseGrownAt(rp, side, asset, r.amount, r.index, o.now);
      if (side === "collateral") get(asset).supply = grown;
      else get(asset).debt = grown;
    }
  return [...out.values()];
}

/** The account's rows as the Lifetime flows panel's timeline, in USD. Null
 *  with no rows. */
export function aaveBaseFlowTimeline(rp: AaveBaseReplay, o: AaveBaseFlowOptions): FlowTimeline | null {
  const { replayed } = rp;
  if (replayed.length === 0) return null;
  const used = new Set(replayed.flatMap((r) => r.legs.map((l) => l.bucket)));
  if (rp.writtenOff.length > 0) used.add("writtenOff");
  // The supply lines always; the debt's where the account borrowed; every
  // other line where a row filled it.
  const base = new Set<string>(["deposited", "withdrawn", INTEREST_EARNED]);
  if (rp.borrower) for (const k of ["borrowed", INTEREST_ACCRUED, "repaid"]) base.add(k);
  const buckets = AAVE_V3_BASE_FLOW_BUCKETS.filter((b) => base.has(b.key) || used.has(b.key));
  const notCounted = o.notCounted ?? AAVE_V3_NOT_COUNTED;

  const flowEvents: FlowEvent[] = replayed.map((r) => {
    const moved = new Set<FlowSide>();
    for (const l of r.legs) if (!ACCRUAL_KEYS.has(l.bucket)) moved.add(l.side);
    const liq = r.legs.some((l) => l.bucket === "liquidatedCollateral" || l.bucket === "liquidatedDebt");
    return {
      id: r.ev.id,
      ts: r.ev.timestamp,
      block: r.ev.blockNumber,
      tick:
        liq || r.seizureTransfer
          ? "liquidation"
          : moved.size === 2
            ? "both"
            : moved.has("debt")
              ? "debt"
              : "collateral",
      legs: r.legs.map((l) => ({ bucket: l.bucket, usd: l.amount * l.price, symbol: l.symbol })),
      tx: r.tx,
      countsTx: countsTx(r.ev, notCounted),
      balances: r.after.map((b) => ({
        asset: b.asset,
        symbol: b.symbol,
        side: b.side,
        amount: Math.max(0, b.amount),
        index: b.index,
      })),
      prices: r.prices,
    };
  });
  const days = daysFromEvents(
    buckets.map((b) => b.key),
    flowEvents,
  );

  const today = Math.floor(o.now / DAY_S);
  const held = nowBalances(rp, o);
  const open = held.some((h) => h.supply > DUST || h.debt > DUST);
  const lastTs = replayed[replayed.length - 1].ev.timestamp;
  const endDay = open ? Math.max(today, Math.floor(lastTs / DAY_S) + 1) : Math.floor(lastTs / DAY_S) + 1;

  // Prices by day: each reserve's at-block prices (the day's last), the
  // store's for every other day, and today's oracle price.
  const todayPrice = (a: string) => {
    const p = o.todayPrices[a];
    return p != null && p > 0 ? p : null;
  };
  const byAsset = new Map<string, Map<number, number>>();
  const firstDayOf = new Map<string, number>();
  const firstPriceOf = new Map<string, number>();
  for (const r of replayed) {
    const d = Math.floor(r.ev.timestamp / DAY_S);
    for (const a of new Set([...r.legs.map((l) => l.asset), ...r.after.map((b) => b.asset)])) {
      if (!byAsset.has(a)) byAsset.set(a, new Map());
      if (!firstDayOf.has(a)) firstDayOf.set(a, d);
    }
    for (const l of r.legs) if (l.price > 0 && !firstPriceOf.has(l.asset)) firstPriceOf.set(l.asset, l.price);
    for (const p of r.prices) {
      const obs = byAsset.get(p.asset) ?? new Map<number, number>();
      obs.set(d, p.usd);
      byAsset.set(p.asset, obs);
      if (!firstPriceOf.has(p.asset)) firstPriceOf.set(p.asset, p.usd);
    }
  }
  for (const [a, obs] of byAsset) {
    const d0 = firstDayOf.get(a)!;
    const rowDays = new Set(obs.keys());
    for (const [d, p] of o.dailyPrices?.[a] ?? []) if (p > 0 && !rowDays.has(d) && d < today) obs.set(d, p);
    const p0 = firstPriceOf.get(a);
    if (p0 != null && ![...obs.keys()].some((d) => d <= d0)) obs.set(d0, p0);
    const p = todayPrice(a);
    if (open && p != null) obs.set(today, p);
  }
  const dailyPrices: Record<string, [number, number][]> = {};
  for (const [a, obs] of byAsset) dailyPrices[a] = [...obs].sort((x, y) => x[0] - y[0]);

  // Each reserve's indexes at each day's close, from its first row to the end.
  const indexes: FlowIndexes = { basis: "aave-rows", assets: {} };
  for (const a of byAsset.keys()) {
    const sKnots = rp.knots.get(`collateral:${a}`);
    const dKnots = rp.knots.get(`debt:${a}`);
    if (!sKnots && !dKnots) continue;
    const list: [number, number | null, number | null][] = [];
    for (let d = firstDayOf.get(a)!; d <= endDay; d++) {
      const close = Math.min((d + 1) * DAY_S, o.now);
      list.push([d, indexAt(sKnots, close), indexAt(dKnots, close)]);
    }
    indexes.assets[a] = list;
  }

  const assets: NonNullable<FlowLive["assets"]> = [];
  let collateralUsd = 0;
  let debtUsd = 0;
  for (const h of held) {
    const p = todayPrice(h.asset) ?? dailyPrices[h.asset]?.at(-1)?.[1] ?? 0;
    if (h.supply > DUST) {
      assets.push({ side: "collateral", symbol: h.symbol, amount: h.supply, usd: h.supply * p });
      collateralUsd += h.supply * p;
    }
    if (h.debt > DUST) {
      assets.push({ side: "debt", symbol: h.symbol, amount: h.debt, usd: h.debt * p });
      debtUsd += h.debt * p;
    }
  }
  const pending = rp.writtenOff.map((w) => ({
    bucket: "writtenOff",
    symbol: w.symbol,
    usd: w.amount * (todayPrice(w.asset) ?? dailyPrices[w.asset]?.at(-1)?.[1] ?? 0),
  }));
  const todayPrices: Record<string, number> = {};
  for (const a of byAsset.keys()) {
    const p = todayPrice(a) ?? dailyPrices[a]?.at(-1)?.[1];
    if (p != null && p > 0) todayPrices[a] = p;
  }

  return {
    buckets,
    days,
    live: { collateralUsd, debtUsd, assets, ...(pending.length > 0 ? { pending } : {}) },
    todayPrices,
    dailyPrices,
    seriesCarry: true,
    indexes,
    today: open ? today : endDay,
    totalEvents: replayed.length,
    words: aaveBaseFlowWords(o.brand, rp.borrower),
  };
}

/** The panel's words for an Aave V3 Pool account on Base. */
export function aaveBaseFlowWords(brand: string, borrower: boolean): FlowWords {
  return {
    held: "Still supplied",
    restBySide: {
      collateral: "Market move and interest since the last event",
      ...(borrower ? { debt: "Market move and interest since the last event" } : {}),
    },
    restNote: {
      collateral: `the change in each reserve's ${brand} oracle price since its flows, and the interest each supply earned since its reserve's last event`,
      debt: `the change in each borrowed reserve's ${brand} oracle price since its flows, and the interest each borrow built since its reserve's last event`,
    },
    basis: {
      collateral: `Each flow is valued at ${brand}'s oracle price for its reserve at its block.`,
      debt: `Each flow is valued at ${brand}'s oracle price for its reserve at its block.`,
    },
    heldBasis: {
      collateral:
        "each reserve's supply after its last event by then, grown as the supply grew until the reserve's next event (after the last, to the Pool's balance today), at the price of its latest priced day.",
      debt: "each reserve's debt after its last event by then, grown as the debt grew until the reserve's next event (after the last, to the Pool's balance today), at the price of its latest priced day.",
    },
    linePrices: `at each reserve's ${brand} oracle price at the end of the day, with the balances grown by their reserves' interest since the last event`,
    moment: {
      noPrice: {
        collateral: `No ${brand} oracle price is recorded for this day, so each reserve is stated in tokens.`,
        debt: `No ${brand} oracle price is recorded for this day, so each reserve is stated in tokens.`,
      },
      notes: [],
    },
  };
}

/** The rows as the event cards' sums read them (lib/shared/flow-focus.ts):
 *  each row's legs in USD and in tokens, ascending; the interest legs are
 *  accruals, not the event's act. */
export function aaveBaseFocusEvents(rp: AaveBaseReplay): FocusEvent[] {
  return rp.replayed.map((r) => ({
    id: r.ev.id,
    ts: r.ev.timestamp,
    tx: r.tx,
    legs: r.legs.map((l) => ({
      bucket: l.bucket,
      usd: l.amount * l.price,
      amount: l.amount,
      symbol: l.symbol,
      ...(ACCRUAL_KEYS.has(l.bucket) ? { accrual: true } : {}),
    })),
  }));
}

/** Whether a bucket is an interest line. */
export const isAaveBaseInterest = (bucket: string): boolean => ACCRUAL_KEYS.has(bucket);
export const aaveBaseLegSign = signOf;
