// Moonwell economics reduction: the position card's captions (the interest
// split of what is supplied and owed, the borrow rate) and the per-market
// lifetime sums they read, from the wallet's mToken events, or from the
// Base route's sums and a windowed page's opening balance. The Lifetime flows
// panel replays the rows itself (lib/moonwell/flows.ts).
//
// Debt lines are the last event's EMITTED accountBorrows, upgraded to the
// live borrowBalanceStored when the detail page's chain lane lands (each
// row's `live` flag names the basis). Wallet↔wallet mToken transfers emit no
// Mint/Redeem and are outside the underlying sums.

import type { MoonwellPositionView } from "@/components/protocol/moonwell/moonwell-position-card";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isMoonwellEvent } from "@/lib/shared/types/event-shape";
import { scaleBaseUnits, type TimelineOpeningBalance } from "@/lib/shared/timeline-opening-balance";
import { MOONWELL_MARKET_BY_KEY } from "@/lib/moonwell/asset-catalog";

const DUST = 1e-9;

/** Per-market lifetime gross underlying flows, replayed from the wallet's own
 *  mToken events. Addresses ride along (from the catalog) for oracle pricing. */
export interface MarketFlows {
  market: string;
  symbol: string;
  address?: string;
  supplied: number;
  withdrawn: number;
  borrowed: number;
  repaid: number;
  liquidatedDebt: number;
  /** Σ of the supply rows' interest since the previous row, the last supply
   *  row's balance after, and whether every supply row carried its balance
   *  (the rate was read). Filled from the event stream only. */
  supplyInterest?: number;
  lastSupplyAfter?: number;
  supplyRowsWhole?: boolean;
}

/** One market's lifetime supply interest from the whole event stream: Σ the
 *  rows' interest since the previous row, plus the head value less the last
 *  row's balance. Null when a supply row had no rate or there is no head
 *  value. */
function supplyLifetimeInterest(f: MarketFlows | undefined, current: number | undefined | null): number | null {
  if (!f || f.supplyRowsWhole !== true || f.lastSupplyAfter == null || current == null) return null;
  return (f.supplyInterest ?? 0) + (current - f.lastSupplyAfter);
}

/** Raw per-market accumulation from a wallet's own mToken events — BEFORE the
 *  repaid −= liquidatedDebt carve-out below. Kept separate from
 *  `replayMoonwellLifetime` so a windowed page can accumulate its loaded rows
 *  on the SAME uncorrected basis the opening balance's own buckets carry
 *  (rails-server's `flowsSql` is deliberately uncorrected for the same
 *  reason), sum the two, and apply the correction exactly once over the
 *  merged total. Applying it to either half alone would subtract the
 *  liquidation twice, or subtract it from a `repaid` figure that never held
 *  it in the first place. */
function accumulateMoonwellFlows(events: BaseActivityEvent[]): Map<string, MarketFlows> {
  const flows = new Map<string, MarketFlows>();
  const get = (market: string, symbol: string): MarketFlows => {
    const cur = flows.get(market) ?? {
      market,
      symbol,
      address: MOONWELL_MARKET_BY_KEY[market]?.underlying,
      supplied: 0,
      withdrawn: 0,
      borrowed: 0,
      repaid: 0,
      liquidatedDebt: 0,
    };
    flows.set(market, cur);
    return cur;
  };

  for (const ev of events) {
    if (!isMoonwellEvent(ev)) continue;
    const ctx = ev.context.data;
    if (ctx.side === "supply") {
      const r = get(ctx.market, ctx.marketSymbol);
      if (ctx.supplyAfter == null) r.supplyRowsWhole = false;
      else {
        r.supplyRowsWhole = r.supplyRowsWhole ?? true;
        r.lastSupplyAfter = Number(ctx.supplyAfter);
        r.supplyInterest = (r.supplyInterest ?? 0) + Number(ctx.interestSincePrevious ?? "0");
      }
    }
    // Liquidation: the row's amount is the debt the liquidator repaid on this
    // (borrowed) market. The paired RepayBorrow row carries the same movement
    // into `repaid`, so the liquidation row feeds ONLY the liquidated bucket —
    // the repaid bucket is reduced by it later, once, over the merged total.
    if (ctx.eventType === "liquidation") {
      const covered = Math.abs(Number(ctx.assetsDelta ?? "0"));
      if (Number.isFinite(covered)) get(ctx.market, ctx.marketSymbol).liquidatedDebt += covered;
      continue;
    }
    if (ctx.eventType === "transfer_in" || ctx.eventType === "transfer_out") continue; // mToken lane, no underlying amount
    const mag = Math.abs(Number(ctx.assetsDelta ?? "0"));
    if (!Number.isFinite(mag) || mag === 0) continue;
    const r = get(ctx.market, ctx.marketSymbol);
    if (ctx.eventType === "mint") r.supplied += mag;
    else if (ctx.eventType === "redeem") r.withdrawn += mag;
    else if (ctx.eventType === "borrow") r.borrowed += mag;
    else if (ctx.eventType === "repay") r.repaid += mag;
  }
  return flows;
}

function replayMoonwellLifetime(events: BaseActivityEvent[]): Map<string, MarketFlows> {
  const flows = accumulateMoonwellFlows(events);
  // A liquidation's debt leg is ALSO a RepayBorrow (payer = liquidator), so it
  // landed in `repaid` too. Move it: repaid keeps only voluntary repayments.
  for (const f of flows.values()) {
    if (f.liquidatedDebt > 0) f.repaid = Math.max(0, f.repaid - f.liquidatedDebt);
  }
  return flows;
}

/**
 * The lifetime flows for a WINDOWED page: the opening balance's raw
 * (uncorrected) buckets seeded first, the loaded rows' own raw accumulation
 * added on top, and the repaid −= liquidatedDebt carve-out applied exactly
 * ONCE, over the merged total — never to either half alone (see
 * `accumulateMoonwellFlows` above).
 *
 * Pass the result to `computeMoonwellEconomics` / `computeMoonwellCardCaptions`
 * as `precomputedLifetime` — the seam that already existed for the swept Base
 * explorers, which draw a capped slice of a longer history and must still
 * state the whole of it. This is the same claim reached by a different route,
 * so it reuses the seam rather than teaching the reducer a second one.
 *
 * The two halves never overlap: the opening balance covers `block_number <
 * cutoffBlock` and every event passed in is at or after it, so summing them is
 * addition and not reconciliation.
 *
 * ⚠️ A leg the opening balance cannot scale — no decimals for its market — is
 * NOT added as zero. The market is dropped from the lifetime layer entirely,
 * even where the loaded rows also touched it, so the tower shows nothing for
 * it rather than a total that is short by whatever the summarised part held —
 * the same refusal the reducer already makes for an unpriced market.
 */
export function moonwellLifetimeWithOpening(
  events: BaseActivityEvent[],
  opening: TimelineOpeningBalance | null | undefined,
): MarketFlows[] | undefined {
  if (!opening) return undefined;
  const merged = accumulateMoonwellFlows(events);
  const get = (market: string): MarketFlows => {
    const cur = merged.get(market) ?? {
      market,
      symbol: MOONWELL_MARKET_BY_KEY[market]?.symbol ?? market.toUpperCase(),
      address: MOONWELL_MARKET_BY_KEY[market]?.underlying,
      supplied: 0,
      withdrawn: 0,
      borrowed: 0,
      repaid: 0,
      liquidatedDebt: 0,
    };
    merged.set(market, cur);
    return cur;
  };

  // The opening balance's leg names are the field names below, matching
  // rails-server's flowsSql exactly so the merge needs no translation table.
  const LEGS = ["supplied", "withdrawn", "borrowed", "repaid", "liquidatedDebt"] as const;
  const unscalable = new Set<string>();
  for (const bucket of opening.flows ?? []) {
    const scaled: Partial<Record<(typeof LEGS)[number], number>> = {};
    let scalable = true;
    for (const leg of LEGS) {
      const raw = bucket.legs[leg];
      if (raw === undefined) continue;
      const value = scaleBaseUnits(raw, bucket.decimals);
      if (value == null) {
        scalable = false;
        break;
      }
      scaled[leg] = value;
    }
    if (!scalable) {
      unscalable.add(bucket.key);
      continue;
    }
    const r = get(bucket.key);
    for (const leg of LEGS) r[leg] += scaled[leg] ?? 0;
  }
  // Dropped even where the loaded rows above already created an entry for this
  // market — a window-only total would understate it by whatever the
  // summarised part held, which is worse than stating nothing.
  for (const market of unscalable) merged.delete(market);

  for (const f of merged.values()) {
    if (f.liquidatedDebt > 0) f.repaid = Math.max(0, f.repaid - f.liquidatedDebt);
  }

  return [...merged.values()];
}

/** Chain-faithful interest on one leg (the Spark legInterest gates):
 *  - no current figure / no gross inflow → can't attribute, bail;
 *  - interest < dust → zero (or negative: missed principal, bail);
 *  - interest > grossIn → >100% cumulative yield, physically implausible → bail. */
function legInterest(current: number | undefined, netPrincipal: number, grossIn: number): number {
  if (current == null || grossIn <= 0) return 0;
  const interest = current - netPrincipal;
  if (interest < DUST) return 0;
  if (interest > grossIn) return 0;
  return interest;
}

/** Position-card stat captions (the V4 spoke-card grammar, computed with this
 *  tier's gates). null = the gate failed and the caption simply doesn't render. */
export interface MoonwellCardCaptions {
  /** USD of accrued supply interest included in the collateral value. */
  supplyInterestUsd: number | null;
  /** USD of accrued borrow interest included in the debt figure. */
  debtInterestUsd: number | null;
  /** Current variable borrow APR (%). `avg` when debt-USD-weighted across
   *  several borrowed markets; `symbol` names the market when single. */
  borrowRate: { pct: number; avg: boolean; symbol?: string } | null;
}

/** USD of accrued interest included in one side's figure — per live market,
 *  (current − net event principal) × oracle price, summed. STRICT: a market
 *  that can't attribute (no captured inflow, negative interest = missed
 *  principal, interest > gross inflow = an mToken transfer the underlying sums
 *  never saw, no current reading, or an unpriced market) nulls the whole
 *  caption rather than understate it. */
function sideInterestUsd(
  side: "supply" | "debt",
  view: MoonwellPositionView,
  lifetime: Map<string, MarketFlows> | null,
  usdOf: (address: string | undefined, amount: number) => number | null,
): number | null {
  if (!lifetime) return null;
  let sum = 0;
  if (side === "supply") {
    const live = view.supplies.filter((r) => r.mTokens > 0);
    if (live.length === 0) return null;
    for (const cur of live) {
      if (cur.current == null) return null; // no chain read → can't split
      const f = lifetime.get(cur.market);
      // The rows' own interest when the stream is whole; else the flows split.
      const fromRows = supplyLifetimeInterest(f, cur.current);
      if (fromRows == null && (!f || f.supplied <= 0)) return null;
      const interest = fromRows ?? cur.current - (f!.supplied - f!.withdrawn);
      if (interest < -DUST || (fromRows == null && interest > f!.supplied)) return null;
      if (interest <= DUST) continue;
      const usd = usdOf(cur.address, interest);
      if (usd == null) return null;
      sum += usd;
    }
  } else {
    const live = view.borrows.filter((r) => r.amount > 0);
    if (live.length === 0) return null;
    for (const cur of live) {
      const f = lifetime.get(cur.market);
      if (!f || f.borrowed <= 0) return null;
      const net = f.borrowed - f.repaid - f.liquidatedDebt;
      const interest = cur.amount - net;
      if (interest < -DUST || interest > f.borrowed) return null;
      if (interest <= DUST) continue;
      const usd = usdOf(cur.address, interest);
      if (usd == null) return null;
      sum += usd;
    }
  }
  return sum;
}

export function computeMoonwellCardCaptions(
  view: MoonwellPositionView,
  events?: BaseActivityEvent[],
  /** Lifetime sums reduced over the WHOLE history elsewhere (the Base sweep
   *  route) — the interest split then attributes against the whole life
   *  rather than a capped slice. When given, `events` are not reduced. */
  precomputedLifetime?: MarketFlows[],
): MoonwellCardCaptions {
  const prices = view.priceByAddress;
  const usdOf = (address: string | undefined, amount: number): number | null => {
    if (!address) return null;
    const p = prices?.[address.toLowerCase()];
    return typeof p === "number" && p > 0 ? amount * p : null;
  };
  const lifetime = precomputedLifetime
    ? new Map(precomputedLifetime.map((f) => [f.market, f]))
    : events && events.length > 0
      ? replayMoonwellLifetime(events)
      : null;

  // Borrow rate — from the per-market chain read (borrowRatePerTimestamp,
  // annualized). One borrowed market → its own rate; several → the
  // debt-USD-weighted average, with the strict guard (every borrowed market
  // rated AND oracle-priced, else omit).
  let borrowRate: MoonwellCardCaptions["borrowRate"] = null;
  const borrowed = view.borrows.filter((r) => r.amount > 0);
  const rateOf = (market: string): number | null => view.ratesByMarket?.[market]?.borrowApr ?? null;
  if (borrowed.length === 1) {
    const r = rateOf(borrowed[0].market);
    if (r != null) borrowRate = { pct: r * 100, avg: false, symbol: borrowed[0].symbol };
  } else if (borrowed.length > 1 && borrowed.every((b) => rateOf(b.market) != null)) {
    let wSum = 0;
    let rSum = 0;
    for (const b of borrowed) {
      const w = usdOf(b.address, b.amount);
      if (w == null || w <= 0) {
        wSum = 0;
        break;
      }
      wSum += w;
      rSum += (rateOf(b.market) as number) * w;
    }
    if (wSum > 0) borrowRate = { pct: (rSum / wSum) * 100, avg: true };
  }

  return {
    supplyInterestUsd: sideInterestUsd("supply", view, lifetime, usdOf),
    debtInterestUsd: sideInterestUsd("debt", view, lifetime, usdOf),
    borrowRate,
  };
}
