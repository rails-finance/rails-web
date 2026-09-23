// Compound V2 economics reduction — the dual tower with lifetime flows and the
// debt interest split.
// ----------------------------------------------------------------------------
// Collateral lines are the CURRENT value when the chain read landed — the exact
// cToken balance (slot-verified Transfer replay) × the market's
// exchangeRateStored, i.e. balanceOfUnderlying, interest included — and the
// replayed principal otherwise (the provenance asserts which basis each line
// carries). Debt lines are the last event's EMITTED accountBorrows (a
// liquidation's merged repay leg counts — an account liquidated since its last
// voluntary repay is not stale), upgraded to the live borrowBalanceStored when
// the detail page's chain lane lands (each row's `live` flag names the basis).
// USD is ON-CHAIN: each market valued at Compound's own oracle
// (getUnderlyingPrice — the same price the Comptroller reads), threaded onto
// `priceByMarket` (keyed by MARKET, not address: two markets share WBTC's
// address and cETH has none).
//
// With the wallet's event stream (optional second arg) the tower gains the
// lifetime layer: hatched withdrawn/repaid segments per market, the
// liquidation-cleared debt segments, the faded lifetime-inflow bar, and — on a
// single-market debt side — the accrued-interest segment (current − net event
// principal, the Spark legInterest arithmetic with its plausibility gates).
// Unlike Moonwell's, a liquidation here is ONE row — the index merged its
// repay leg — so the liquidated bucket needs no de-duplication against repays.
// Seizures move cTokens on ANOTHER market with no underlying amount, so they
// are outside the underlying flow buckets (they live on the cToken lane); a
// seized supply leg therefore fails the interest-attribution gates and the
// caption simply doesn't render — never a fabricated split.
// When RPC is down and a contributing market is unpriced, the tower degrades
// to the token-only gated list (a strict per-total guard) rather than assert a
// partial USD total.

import type { CompoundV2PositionView } from "@/components/protocol/compound-v2/compound-v2-position-card";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isCompoundV2Event } from "@/lib/shared/types/event-shape";
import {
  positionSupplyCurrentProv,
  positionSupplyPrincipalProv,
  positionDebtProv,
  compoundV2LifetimeFlowProv,
  compoundV2DebtInterestProv,
  compoundV2DebtPrincipalProv,
} from "@/lib/compound-v2/event-provenance";
import { compoundV2LiveDebtProv } from "@/lib/compound-v2/position-provenance";
import { COMPOUND_V2_MARKET_BY_KEY } from "@/lib/compound-v2/asset-catalog";
import type { ChainTruthTowerData, TowerLine } from "@/lib/shared/chain-truth-economics";
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
 * Pass the result to `computeCompoundV2Economics` / `computeCompoundV2CardCaptions`
 * as `precomputedLifetime`. The opening buckets stay keyed by MARKET (the
 * reducer's own grain — two markets share WBTC's symbol), their decimals
 * filled in by the summary proxy from the same fixed catalog the rows resolve
 * through.
 *
 * ⚠️ A leg the opening balance cannot scale — no decimals for its market — is
 * NOT added as zero. The market is dropped from the lifetime layer entirely,
 * even where the loaded rows also touched it, so the tower shows nothing for
 * it rather than a total that is short by whatever the summarised part held.
 */
export function compoundV2LifetimeWithOpening(
  events: BaseActivityEvent[],
  opening: TimelineOpeningBalance | null | undefined,
): MarketFlows[] | undefined {
  if (!opening) return undefined;
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
  for (const market of unscalable) merged.delete(market);

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
      if (!f || f.supplied <= 0) return null;
      const net = f.supplied - f.withdrawn;
      const interest = cur.current - net;
      if (interest < -DUST || interest > f.supplied) return null;
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

export function computeCompoundV2Economics(
  view: CompoundV2PositionView,
  events?: BaseActivityEvent[],
  /** See computeCompoundV2CardCaptions — the same seam, the same rules. */
  precomputedLifetime?: MarketFlows[],
): ChainTruthTowerData {
  const prices = view.priceByMarket;
  const usdOf = (market: string, amount: number): number | null => {
    const p = prices?.[market];
    return typeof p === "number" && p > 0 ? amount * p : null;
  };

  // Collateral: the current value (interest included) when the chain read
  // landed, the replayed principal otherwise — the provenance names the basis.
  const supplyLines: TowerLine[] = view.supplies
    .filter((r) => r.cTokens > 0)
    .map((r) => {
      const amount = r.current ?? r.principal;
      return {
        key: r.market,
        symbol: r.symbol,
        amount,
        usd: usdOf(r.market, amount),
        prov:
          r.current != null ? positionSupplyCurrentProv(r.symbol, r.cSymbol) : positionSupplyPrincipalProv(r.symbol),
      };
    })
    .filter((l) => l.amount > DUST);

  const debtLines: TowerLine[] = view.borrows
    .filter((r) => r.amount > 0)
    .map((r) => {
      const m = COMPOUND_V2_MARKET_BY_KEY[r.market];
      return {
        key: r.market,
        symbol: r.symbol,
        amount: r.amount,
        usd: usdOf(r.market, r.amount),
        // The live borrowBalanceStored lane when the detail page's chain read
        // upgraded this row; the emitted-accountBorrows lane otherwise.
        prov: r.live ? compoundV2LiveDebtProv(r.symbol, r.cSymbol, m?.ctoken) : positionDebtProv(r.symbol),
      };
    });

  // ── Lifetime layer (needs the event stream) ────────────────────────────────
  const lifetime = precomputedLifetime
    ? new Map(precomputedLifetime.map((f) => [f.market, f]))
    : events && events.length > 0
      ? replayCompoundV2Lifetime(events)
      : null;
  const flowLines = (
    pick: (r: MarketFlows) => number,
    flow: "withdrawn" | "repaid" | "liquidated debt",
    keyPrefix: string,
  ): TowerLine[] =>
    lifetime
      ? [...lifetime.values()]
          .filter((r) => pick(r) > DUST)
          .map((r) => ({
            key: `${keyPrefix}-${r.market}`,
            symbol: r.symbol,
            amount: pick(r),
            usd: usdOf(r.market, pick(r)),
            prov: compoundV2LifetimeFlowProv(flow, r.symbol),
          }))
      : [];

  const collExited = flowLines((r) => r.withdrawn, "withdrawn", "coll-withdrawn");
  const debtExited = flowLines((r) => r.repaid, "repaid", "debt-repaid");
  const debtLiquidated = flowLines((r) => r.liquidatedDebt, "liquidated debt", "debt-liq");

  // Interest segment — only on a SINGLE-market debt side (one symbol, one
  // token amount; a cross-market token sum would be meaningless). The tower
  // stacks `current + interest` as the total, so when the split engages the
  // current line must DROP to the net event principal — the emitted
  // accountBorrows already includes the interest accrued to that event.
  let interest: TowerLine | null = null;
  if (lifetime && debtLines.length === 1) {
    const cur = debtLines[0];
    const f = lifetime.get(cur.key);
    if (f) {
      const net = f.borrowed - f.repaid - f.liquidatedDebt;
      const amt = legInterest(cur.amount, net, f.borrowed);
      if (amt > 0) {
        interest = {
          key: "debt-interest",
          symbol: cur.symbol,
          amount: amt,
          usd: usdOf(cur.key, amt),
          prov: compoundV2DebtInterestProv(cur.symbol, view.borrows.find((r) => r.amount > 0)?.live),
        };
        debtLines[0] = {
          ...cur,
          amount: net,
          usd: usdOf(cur.key, net),
          prov: compoundV2DebtPrincipalProv(cur.symbol),
        };
      }
    }
  }

  // Value the tower only when EVERY contributing line is oracle-priced — a strict
  // per-total guard. A single unpriced market drops it to the token gated list,
  // so a bar height is never a partial (misleading) USD figure.
  const contributing = [
    ...supplyLines,
    ...debtLines,
    ...collExited,
    ...debtExited,
    ...debtLiquidated,
    ...(interest ? [interest] : []),
  ];
  const valued = contributing.length > 0 && contributing.every((l) => l.usd != null);

  // Lifetime inflow (the faded side bar) — USD when valued; a token amount is
  // only meaningful when one market flowed, else suppressed.
  const inflow = (pick: (r: MarketFlows) => number): number => {
    if (!lifetime) return 0;
    const rows = [...lifetime.values()].filter((r) => pick(r) > DUST);
    if (rows.length === 0) return 0;
    if (valued) return rows.reduce((s, r) => s + (usdOf(r.market, pick(r)) ?? 0), 0);
    return rows.length === 1 ? pick(rows[0]) : 0;
  };

  // Whether any priced contributing market rides a stored constant with no
  // feed — stated in the note so a bar never leans silently on a frozen price.
  const marketKeys = new Set<string>([
    ...supplyLines.map((l) => l.key),
    ...debtLines.map((l) => l.key),
    ...(lifetime ? [...lifetime.keys()] : []),
  ]);
  const anyFixed = [...marketKeys].some((k) => view.priceFixedByMarket?.[k] === true);

  return {
    valued,
    // On-chain oracle price → chain-derived, so the USD bars survive On-chain-values.
    priceKind: valued ? "chain-derived" : undefined,
    collateral: {
      current: supplyLines,
      interest: null,
      exited: collExited,
      liquidated: [],
      lifetimeInflow: inflow((r) => r.supplied),
    },
    debt: {
      current: debtLines,
      interest,
      exited: debtExited,
      liquidated: debtLiquidated,
      lifetimeInflow: inflow((r) => r.borrowed),
    },
    interestNote:
      (anyFixed
        ? "One or more markets here are priced by a fixed number stored in the oracle, with no live feed behind it — the value is the one Compound itself uses, but nothing updates those legs. "
        : "") +
        (interest != null
          ? ""
          : "Collateral is shown at its current value — the deposit plus the interest it has earned; the spread over the amount deposited is that interest. Debt is shown as of the position's last borrow, repayment or liquidation, so interest that has built up since then isn't counted there yet. Seized collateral moves as receipt tokens with no underlying amount, so it shows up in the balances rather than the flow totals. The principal-versus-interest split is shown only when a single borrowed market's history lines up cleanly. USD is valued at Compound's own oracle price.") ||
      undefined,
  };
}
