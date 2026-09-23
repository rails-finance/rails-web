// Dolomite economics reduction — the dual tower with lifetime flows.
// ----------------------------------------------------------------------------
// Current lines are par × the market's CURRENT index (interest included) when
// the market-state read landed, and the par figure otherwise — the provenance
// asserts which basis each line carries. A negative balance IS debt (the core
// has no Borrow action), so the flow buckets follow the balance's SIDE OF
// ZERO rather than an action name: a leg's emitted deltaWei while the par sat
// negative is debt moving (borrow / repay); while positive it is the lending
// side (deposit / withdraw). A leg that crosses zero splits EXACTLY at the
// par zero-crossing — both pieces of one leg scale by the same index, so the
// wei split is proportionally exact, not an estimate.
//
// There is deliberately NO principal-vs-accrued interest split here:
// Dolomite's interest lives in the per-market index (par is the scaled
// balance), so an exact split would need the index at each event — a lane the
// chain overlay does not carry. Nothing is estimated in its place.
//
// USD is ON-CHAIN: each market valued at the core's own getMarketPrice,
// threaded onto priceByMarket (keyed by MARKET ID — symbols collide on this
// roster). The strict per-total guard holds: one unpriced market drops the
// tower to the token gated list rather than assert a partial USD figure.

import type { DolomitePositionView } from "@/components/protocol/dolomite/dolomite-position-card";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isDolomiteEvent } from "@/lib/shared/types/event-shape";
import { positionCurrentProv, positionParProv, dolomiteLifetimeFlowProv } from "@/lib/dolomite/event-provenance";
import type { ChainTruthTowerData, TowerLine } from "@/lib/shared/chain-truth-economics";
import { scaleBaseUnits, type TimelineOpeningBalance } from "@/lib/shared/timeline-opening-balance";

const DUST = 1e-9;

/** Per-market lifetime gross flows, replayed from the account's own legs. */
interface MarketFlows {
  marketId: number;
  symbol: string;
  deposited: number;
  withdrawn: number;
  borrowed: number;
  repaid: number;
  liquidatedDebt: number;
  seizedCollateral: number;
}

function replayDolomiteLifetime(events: BaseActivityEvent[]): Map<number, MarketFlows> {
  const flows = new Map<number, MarketFlows>();
  const get = (marketId: number, symbol: string): MarketFlows => {
    const cur = flows.get(marketId) ?? {
      marketId,
      symbol,
      deposited: 0,
      withdrawn: 0,
      borrowed: 0,
      repaid: 0,
      liquidatedDebt: 0,
      seizedCollateral: 0,
    };
    flows.set(marketId, cur);
    return cur;
  };

  for (const ev of events) {
    if (!isDolomiteEvent(ev)) continue;
    const ctx = ev.context.data;
    const delta = Number(ctx.weiDelta ?? "0");
    if (!Number.isFinite(delta) || delta === 0) continue;
    const r = get(ctx.marketId, ctx.marketSymbol);

    // The two borrower-side liquidation legs get their own buckets.
    if (ctx.eventType === "liquidation") {
      r.liquidatedDebt += Math.abs(delta);
      continue;
    }
    if (ctx.eventType === "seize_out") {
      r.seizedCollateral += Math.abs(delta);
      continue;
    }

    // Everything else buckets by the balance's side of zero. The exact split
    // at a zero-crossing: par_before and par_after are both par, so the debt
    // fraction |par_before| ÷ |par_after − par_before| of the wei delta is
    // exact (one index scales both pieces).
    const before = Number(ctx.parBefore ?? "0");
    const after = Number(ctx.parAfter ?? "0");
    const mag = Math.abs(delta);
    let debtPortion = 0;
    let supplyPortion = 0;
    if (before <= 0 && after <= 0) debtPortion = mag;
    else if (before >= 0 && after >= 0) supplyPortion = mag;
    else {
      // Crossed zero: the negative endpoint is the debt piece of the move —
      // |negative endpoint| ÷ |after − before| of the wei delta, exactly.
      const span = Math.abs(after - before);
      const negativeEndpoint = before < 0 ? before : after;
      const debtFrac = span > 0 ? Math.abs(negativeEndpoint) / span : 0;
      debtPortion = mag * debtFrac;
      supplyPortion = mag - debtPortion;
    }

    if (delta > 0) {
      r.repaid += debtPortion;
      r.deposited += supplyPortion;
    } else {
      r.borrowed += debtPortion;
      r.withdrawn += supplyPortion;
    }
  }
  return flows;
}

/**
 * The lifetime flows for a WINDOWED page: the opening balance's buckets seeded
 * first, the loaded rows' own replay added on top. The two halves never
 * overlap — the opening balance covers `block_number < cutoffBlock` and every
 * event passed in is at or after it — so summing them is addition, not
 * reconciliation. rails-server's flowsSql restates this reducer's
 * side-of-zero replay branch for branch, the exact zero-crossing split
 * included, so the leg names below are the MarketFlows fields verbatim.
 *
 * Buckets stay keyed by NUMERIC MARKET ID (symbols collide on this roster),
 * their decimals filled in by the summary proxy from the core's own roster.
 * A market the window never touched takes its symbol from `symbolOf` (the
 * view's own rows), degrading to the transform's own `market #N` fallback —
 * a label, never a mis-scaled figure.
 *
 * ⚠️ A leg the opening balance cannot scale — no decimals for its market — is
 * NOT added as zero. The market is dropped from the lifetime layer entirely,
 * even where the loaded rows also touched it, so the tower shows nothing for
 * it rather than a total that is short by whatever the summarised part held.
 */
export function dolomiteLifetimeWithOpening(
  events: BaseActivityEvent[],
  opening: TimelineOpeningBalance | null | undefined,
  symbolOf?: (marketId: number) => string | undefined,
): MarketFlows[] | undefined {
  if (!opening) return undefined;
  const merged = replayDolomiteLifetime(events);
  const get = (marketId: number): MarketFlows => {
    const cur = merged.get(marketId) ?? {
      marketId,
      symbol: symbolOf?.(marketId) ?? `market #${marketId}`,
      deposited: 0,
      withdrawn: 0,
      borrowed: 0,
      repaid: 0,
      liquidatedDebt: 0,
      seizedCollateral: 0,
    };
    merged.set(marketId, cur);
    return cur;
  };

  const LEGS = ["deposited", "withdrawn", "borrowed", "repaid", "liquidatedDebt", "seizedCollateral"] as const;
  const unscalable = new Set<number>();
  for (const bucket of opening.flows ?? []) {
    if (!/^\d+$/.test(bucket.key)) continue; // a `call` row carries no market
    const marketId = Number(bucket.key);
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
      unscalable.add(marketId);
      continue;
    }
    const r = get(marketId);
    for (const leg of LEGS) r[leg] += scaled[leg] ?? 0;
  }
  for (const marketId of unscalable) merged.delete(marketId);

  return [...merged.values()];
}

/** Position-card stat captions. null = the caption simply doesn't render. */
export interface DolomiteCardCaptions {
  /** Current borrow APR (%). `avg` when debt-USD-weighted across several
   *  borrowed markets; `symbol` names the market when single. */
  borrowRate: { pct: number; avg: boolean; symbol?: string } | null;
}

export function computeDolomiteCardCaptions(view: DolomitePositionView): DolomiteCardCaptions {
  const usdOf = (marketId: number, amount: number): number | null => {
    const p = view.priceByMarket?.[String(marketId)];
    return typeof p === "number" && p > 0 ? amount * p : null;
  };
  const rateOf = (marketId: number): number | null => view.ratesByMarket?.[String(marketId)]?.borrowAprPct ?? null;

  let borrowRate: DolomiteCardCaptions["borrowRate"] = null;
  const borrowed = view.borrows.filter((r) => (r.current ?? r.par) > 0);
  if (borrowed.length === 1) {
    const r = rateOf(borrowed[0].marketId);
    if (r != null) borrowRate = { pct: r, avg: false, symbol: borrowed[0].symbol };
  } else if (borrowed.length > 1 && borrowed.every((b) => rateOf(b.marketId) != null)) {
    let wSum = 0;
    let rSum = 0;
    for (const b of borrowed) {
      const w = usdOf(b.marketId, b.current ?? b.par);
      if (w == null || w <= 0) {
        wSum = 0;
        break;
      }
      wSum += w;
      rSum += (rateOf(b.marketId) as number) * w;
    }
    if (wSum > 0) borrowRate = { pct: rSum / wSum, avg: true };
  }

  return { borrowRate };
}

export function computeDolomiteEconomics(
  view: DolomitePositionView,
  events?: BaseActivityEvent[],
  /** The merged whole-history flows on a windowed page (see
   *  dolomiteLifetimeWithOpening). Present, it IS the lifetime layer and
   *  `events` takes no part in it; absent, the events replay as they always
   *  did. A windowed page whose opening balance has not arrived passes
   *  NEITHER — the lifetime layer states nothing rather than a window's
   *  arithmetic. */
  precomputedLifetime?: MarketFlows[],
): ChainTruthTowerData {
  const usdOf = (marketId: number, amount: number): number | null => {
    const p = view.priceByMarket?.[String(marketId)];
    return typeof p === "number" && p > 0 ? amount * p : null;
  };

  const lineOf = (r: DolomitePositionView["supplies"][number], side: "supply" | "debt"): TowerLine => {
    const amount = r.current ?? r.par;
    return {
      key: String(r.marketId),
      symbol: r.symbol,
      amount,
      usd: usdOf(r.marketId, amount),
      prov: r.current != null ? positionCurrentProv(r.symbol, side) : positionParProv(r.symbol, side),
    };
  };

  const supplyLines: TowerLine[] = view.supplies.map((r) => lineOf(r, "supply")).filter((l) => l.amount > DUST);
  const debtLines: TowerLine[] = view.borrows.map((r) => lineOf(r, "debt")).filter((l) => l.amount > DUST);

  // ── Lifetime layer (needs the event stream) ────────────────────────────────
  const lifetime = precomputedLifetime
    ? new Map(precomputedLifetime.map((f) => [f.marketId, f]))
    : events && events.length > 0
      ? replayDolomiteLifetime(events)
      : null;
  const flowLines = (
    pick: (r: MarketFlows) => number,
    flow: Parameters<typeof dolomiteLifetimeFlowProv>[0],
    keyPrefix: string,
  ): TowerLine[] =>
    lifetime
      ? [...lifetime.values()]
          .filter((r) => pick(r) > DUST)
          .map((r) => ({
            key: `${keyPrefix}-${r.marketId}`,
            symbol: r.symbol,
            amount: pick(r),
            usd: usdOf(r.marketId, pick(r)),
            prov: dolomiteLifetimeFlowProv(flow, r.symbol),
          }))
      : [];

  const collExited = flowLines((r) => r.withdrawn, "withdrawn", "coll-withdrawn");
  const collLiquidated = flowLines((r) => r.seizedCollateral, "seized collateral", "coll-seized");
  const debtExited = flowLines((r) => r.repaid, "repaid", "debt-repaid");
  const debtLiquidated = flowLines((r) => r.liquidatedDebt, "liquidated debt", "debt-liq");

  // Value the tower only when EVERY contributing line is oracle-priced — the
  // strict per-total guard: one unpriced market drops it to the token list.
  const contributing = [
    ...supplyLines,
    ...debtLines,
    ...collExited,
    ...collLiquidated,
    ...debtExited,
    ...debtLiquidated,
  ];
  const valued = contributing.length > 0 && contributing.every((l) => l.usd != null);

  // Lifetime inflow (the faded side bar) — USD when valued; a token amount is
  // only meaningful when one market flowed, else suppressed.
  const inflow = (pick: (r: MarketFlows) => number): number => {
    if (!lifetime) return 0;
    const rows = [...lifetime.values()].filter((r) => pick(r) > DUST);
    if (rows.length === 0) return 0;
    if (valued) return rows.reduce((s, r) => s + (usdOf(r.marketId, pick(r)) ?? 0), 0);
    return rows.length === 1 ? pick(rows[0]) : 0;
  };

  return {
    valued,
    // The core's own oracle price → chain-derived, so the USD bars survive
    // the gate.
    priceKind: valued ? "chain-derived" : undefined,
    collateral: {
      current: supplyLines,
      interest: null,
      exited: collExited,
      liquidated: collLiquidated,
      lifetimeInflow: inflow((r) => r.deposited),
    },
    debt: {
      current: debtLines,
      interest: null,
      exited: debtExited,
      liquidated: debtLiquidated,
      lifetimeInflow: inflow((r) => r.borrowed),
    },
    interestNote:
      "Balances carry interest up to the most recent update; where the latest reading hasn't arrived they show the plain balance, a touch behind on interest. Interest here lives in each market's per-second rate rather than as its own line, so the tower shows no split between principal and accrued interest — an exact split would need the rate at every past event, and nothing is estimated in its place. Dolomite has no Borrow action: a negative balance IS the debt, so lifetime totals sort each move by which side of zero the balance sat on, splitting exactly where a balance crossed zero. USD figures use Dolomite's own oracle price.",
  };
}
