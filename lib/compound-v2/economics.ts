// Compound V2 lifetime flows by market, for the position card's interest
// captions (the Lifetime flows panel replays the rows itself:
// lib/shared/ctoken-flows.ts).
// ----------------------------------------------------------------------------
// Supply lines are the CURRENT value when the chain read landed — the exact
// cToken balance × the market's exchangeRateStored, i.e. balanceOfUnderlying,
// interest included; debt lines are the last event's EMITTED accountBorrows,
// upgraded to the live borrowBalanceStored when the detail page's chain lane
// lands. USD is ON-CHAIN: each market valued at Compound's own oracle
// (getUnderlyingPrice), threaded onto `priceByMarket` (keyed by MARKET, not
// address: two markets share WBTC's address and cETH has none).
//
// A liquidation here is ONE row — the index merged its repay leg — so the
// liquidated bucket needs no de-duplication against repays. Seizures move
// cTokens on ANOTHER market with no underlying amount, so they are outside the
// underlying flow buckets; a seized supply leg therefore fails the
// interest-attribution gates and the caption simply doesn't render — never a
// fabricated split.

import type { CompoundV2PositionView } from "@/components/protocol/compound-v2/compound-v2-position-card";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isCompoundV2Event } from "@/lib/shared/types/event-shape";
import { COMPOUND_V2_MARKET_BY_KEY } from "@/lib/compound-v2/asset-catalog";
import type { ServedFolder } from "@/lib/shared/timeline-folder";
import { folderFlows, mergeFlowBuckets } from "@/lib/shared/timeline-folder-reductions";
import { scaleBaseUnits, type TimelineOpeningBalance } from "@/lib/shared/timeline-opening-balance";

const DUST = 1e-9;

/** Per-market lifetime gross underlying flows, replayed from the wallet's own
 *  cToken events. */
interface MarketFlows {
  market: string;
  symbol: string;
  supplied: number;
  withdrawn: number;
  borrowed: number;
  repaid: number;
  liquidatedDebt: number;
  /** Σ of the supply rows' interest since the previous row, the last supply
   *  row's balance after, and whether every supply row carried its balance
   *  (the rate was known). Filled from the event stream only. */
  supplyInterest?: number;
  lastSupplyAfter?: number;
  supplyRowsWhole?: boolean;
}

function replayCompoundV2Lifetime(events: BaseActivityEvent[]): Map<string, MarketFlows> {
  const flows = new Map<string, MarketFlows>();
  const get = (market: string, symbol: string): MarketFlows => {
    const cur = flows.get(market) ?? {
      market,
      symbol,
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
    if (!isCompoundV2Event(ev)) continue;
    const ctx = ev.context.data;
    // A liquidation is ONE row here (the index merged the repay leg it
    // emitted), so its cleared debt lands ONLY in the liquidated bucket —
    // there is no paired repay row to subtract, unlike the Moonwell mold.
    if (ctx.side === "supply") {
      const r = get(ctx.market, ctx.marketSymbol);
      if (ctx.supplyAfter == null) r.supplyRowsWhole = false;
      else {
        r.supplyRowsWhole = r.supplyRowsWhole ?? true;
        r.lastSupplyAfter = Number(ctx.supplyAfter);
        r.supplyInterest = (r.supplyInterest ?? 0) + Number(ctx.interestSincePrevious ?? "0");
      }
    }
    if (ctx.eventType === "liquidation") {
      const covered = Math.abs(Number(ctx.assetsDelta ?? "0"));
      if (Number.isFinite(covered)) get(ctx.market, ctx.marketSymbol).liquidatedDebt += covered;
      continue;
    }
    // cToken-lane moves (no underlying amount): transfers and the named
    // seizure legs live outside the underlying buckets.
    if (
      ctx.eventType === "transfer_in" ||
      ctx.eventType === "transfer_out" ||
      ctx.eventType === "seize_out" ||
      ctx.eventType === "seize_in" ||
      ctx.eventType === "seize_burn"
    )
      continue;
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

/**
 * The lifetime flows for a WINDOWED page: the opening balance's buckets seeded
 * first, the loaded rows' own replay added on top. The two halves never
 * overlap — the opening balance covers `block_number < cutoffBlock` and every
 * event passed in is at or after it — so summing them is addition, not
 * reconciliation. Unlike the Moonwell mold there is no correction pass to
 * apply over the merged total: a V2 liquidation is ONE row with its repay leg
 * already merged in (mig 119), on both sides of the cut alike.
 *
 * Pass the result to `computeCompoundV2CardCaptions`
 * as `precomputedLifetime`. The opening buckets stay keyed by MARKET (the
 * reducer's own grain — two markets share WBTC's symbol), their decimals
 * filled in by the summary proxy from the same fixed catalog the rows resolve
 * through.
 *
 * ⚠️ A leg the opening balance cannot scale — no decimals for its market — is
 * NOT added as zero. The market is dropped from the lifetime layer entirely,
 * even where the loaded rows also touched it, so the captions state nothing for
 * it rather than a total that is short by whatever the summarised part held.
 */
export function compoundV2LifetimeWithOpening(
  events: BaseActivityEvent[],
  opening: TimelineOpeningBalance | null | undefined,
  folders?: readonly ServedFolder[] | null,
): MarketFlows[] | undefined {
  // Undefined = nothing outside `events`, so the reducer reads them as the
  // whole history. On a grouped answer the folders hold members `events` does
  // not, and their flows are the third half of the partition (the summary
  // below the cut, the events and the folders above it).
  if (!opening && (folders?.length ?? 0) === 0) return undefined;
  const merged = replayCompoundV2Lifetime(events);
  const get = (market: string): MarketFlows => {
    const cur = merged.get(market) ?? {
      market,
      symbol: COMPOUND_V2_MARKET_BY_KEY[market]?.symbol ?? market.toUpperCase(),
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
  for (const bucket of mergeFlowBuckets(opening?.flows, folderFlows(folders))) {
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
  for (const market of unscalable) merged.delete(market);

  return [...merged.values()];
}

/** One market's lifetime supply interest from the whole event stream: Σ the
 *  rows' interest since the previous row, plus the head value less the last
 *  row's balance. Null when a supply row had no rate or there is no head
 *  value. */
function supplyLifetimeInterest(f: MarketFlows | undefined, current: number | undefined | null): number | null {
  if (!f || f.supplyRowsWhole !== true || f.lastSupplyAfter == null || current == null) return null;
  return (f.supplyInterest ?? 0) + (current - f.lastSupplyAfter);
}

/** Position-card stat captions (the V4 spoke-card grammar, computed with this
 *  tier's gates). null = the gate failed and the caption simply doesn't render. */
export interface CompoundV2CardCaptions {
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
 *  principal or a seizure the underlying sums never saw, interest > gross
 *  inflow = a cToken transfer outside the sums, no current reading, or an
 *  unpriced market) nulls the whole caption rather than understate it. */
function sideInterestUsd(
  side: "supply" | "debt",
  view: CompoundV2PositionView,
  lifetime: Map<string, MarketFlows> | null,
  usdOf: (market: string, amount: number) => number | null,
): number | null {
  if (!lifetime) return null;
  let sum = 0;
  if (side === "supply") {
    const live = view.supplies.filter((r) => r.cTokens > 0);
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
      const usd = usdOf(cur.market, interest);
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
      const usd = usdOf(cur.market, interest);
      if (usd == null) return null;
      sum += usd;
    }
  }
  return sum;
}

export function computeCompoundV2CardCaptions(
  view: CompoundV2PositionView,
  events?: BaseActivityEvent[],
  /** The merged whole-history flows on a windowed page (see
   *  compoundV2LifetimeWithOpening). Present, it IS the lifetime layer and
   *  `events` takes no part in it; absent, the events replay as they always
   *  did. */
  precomputedLifetime?: MarketFlows[],
): CompoundV2CardCaptions {
  const prices = view.priceByMarket;
  const usdOf = (market: string, amount: number): number | null => {
    const p = prices?.[market];
    return typeof p === "number" && p > 0 ? amount * p : null;
  };
  const lifetime = precomputedLifetime
    ? new Map(precomputedLifetime.map((f) => [f.market, f]))
    : events && events.length > 0
      ? replayCompoundV2Lifetime(events)
      : null;

  // Borrow rate — from the per-market chain read (borrowRatePerBlock,
  // annualized on the market's own model). One borrowed market → its own
  // rate; several → the debt-USD-weighted average, with the strict guard
  // (every borrowed market rated AND oracle-priced, else omit).
  let borrowRate: CompoundV2CardCaptions["borrowRate"] = null;
  const borrowed = view.borrows.filter((r) => r.amount > 0);
  const rateOf = (market: string): number | null => view.ratesByMarket?.[market]?.borrowApr ?? null;
  if (borrowed.length === 1) {
    const r = rateOf(borrowed[0].market);
    if (r != null) borrowRate = { pct: r * 100, avg: false, symbol: borrowed[0].symbol };
  } else if (borrowed.length > 1 && borrowed.every((b) => rateOf(b.market) != null)) {
    let wSum = 0;
    let rSum = 0;
    for (const b of borrowed) {
      const w = usdOf(b.market, b.amount);
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
