// SparkLend economics reduction — the valued dual tower with lifetime flows and
// the debt interest split.
// ----------------------------------------------------------------------------
// Balances are the index's scaled-balance reduction (0008/0011) — the current
// rebased figure, interest included, equal to `balanceOf` at the indexed head —
// and USD is ON-CHAIN: each reserve is valued at SparkLend's OWN oracle —
// IAaveOracle.getAssetPrice, the same price the Pool reads to price collateral
// (threaded onto `priceByAddress`). Both legs are on-chain, so the product is
// chain-derived and belongs in the chain-state view (unlike a DefiLlama cache).
//
// With the wallet's event stream (optional second arg) the tower gains the
// lifetime layer: hatched withdrawn/repaid + liquidated segments per reserve,
// the faded lifetime-inflow bar, and — on a single-reserve debt side — the
// accrued-interest segment (current rebased debt − net event principal, the
// V3 legInterest arithmetic with its plausibility gates). The Spark index is
// genesis-complete (deploy block → head), so lifetime sums are truly all-time.
// spToken transfers (captured and shown on the timeline since mig 159) are
// custody moves, not Pool flows — they stay outside the deposited/withdrawn
// sums by design (the provenance says so), and a transfer-fed reserve fails
// the conservation gates below rather than guess. When RPC is down and a
// contributing reserve is unpriced, the tower degrades to the token-only gated
// list (a strict per-total guard) rather than assert a partial USD total.

import type { SparkPositionView } from "@/components/protocol/spark/spark-position-card";
import type { SparkPositionChainResponse } from "@/lib/api/fetch-spark-position";
import { scaleSparkChainBalance } from "@/lib/api/fetch-spark-position";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isSparkEvent } from "@/lib/shared/types/event-shape";
import {
  positionSupplyProv,
  positionDebtProv,
  sparkLifetimeFlowProv,
  sparkDebtInterestProv,
  sparkDebtPrincipalProv,
} from "@/lib/spark/event-provenance";
import type { ChainTruthTowerData, TowerLine } from "@/lib/shared/chain-truth-economics";
import { scaleBaseUnits, type TimelineOpeningBalance } from "@/lib/shared/timeline-opening-balance";
import type { ServedFolder } from "@/lib/shared/timeline-folder";
import { folderFlows, mergeFlowBuckets } from "@/lib/shared/timeline-folder-reductions";

const DUST = 1e-9;

/** Per-(reserve symbol) lifetime gross flows, replayed from the wallet's own
 *  Pool events. Addresses ride along (from the event flows) for oracle pricing.
 *
 *  Exported because the page cannot always derive this from the events on it: a
 *  wallet with tens of thousands renders only the most recent window, and
 *  reducing THAT would label a recent slice "all time". The window's page sums
 *  the two halves of the cut itself and hands the result in — see
 *  `sparkLifetimeWithOpening` and the `precomputedLifetime` argument below. */
export interface ReserveFlows {
  symbol: string;
  address?: string;
  supplied: number;
  withdrawn: number;
  borrowed: number;
  repaid: number;
  liquidatedCollateral: number;
  liquidatedDebt: number;
}

function reduceSparkLifetime(events: BaseActivityEvent[]): Map<string, ReserveFlows> {
  const flows = new Map<string, ReserveFlows>();
  const get = (symbol: string, address?: string): ReserveFlows => {
    const cur = flows.get(symbol) ?? {
      symbol,
      supplied: 0,
      withdrawn: 0,
      borrowed: 0,
      repaid: 0,
      liquidatedCollateral: 0,
      liquidatedDebt: 0,
    };
    if (address && !cur.address) cur.address = address.toLowerCase();
    flows.set(symbol, cur);
    return cur;
  };

  for (const ev of events) {
    if (!isSparkEvent(ev)) continue;
    const ctx = ev.context.data;
    if (ctx.eventType === "liquidation") {
      const seized = Math.abs(Number(ctx.liquidatedCollateralAmount ?? ctx.assetsDelta));
      const covered = Math.abs(Number(ctx.debtToCover ?? ctx.debtDelta));
      // flows: [collateral out, debt out] — addresses for pricing.
      const collAddr = ctx.collateralAsset ?? ev.flows[0]?.token;
      const debtAddr = ev.flows[1]?.token;
      if (ctx.collateralSymbol && Number.isFinite(seized))
        get(ctx.collateralSymbol, collAddr).liquidatedCollateral += seized;
      if (Number.isFinite(covered)) get(ctx.reserveSymbol, debtAddr).liquidatedDebt += covered;
      continue;
    }
    const mag = Math.abs(Number(ctx.assetsDelta));
    if (!Number.isFinite(mag) || mag === 0) continue;
    const r = get(ctx.reserveSymbol, ev.flows[0]?.token);
    if (ctx.eventType === "supply") r.supplied += mag;
    else if (ctx.eventType === "withdraw") r.withdrawn += mag;
    else if (ctx.eventType === "borrow") r.borrowed += mag;
    else if (ctx.eventType === "repay") r.repaid += mag;
    // transfer_in / transfer_out: custody moves, deliberately NOT flows —
    // they are neither deposits nor withdrawals, so they contribute nothing
    // here and a transfer-fed reserve refuses at the conservation gates.
  }
  return flows;
}

/** Index precomputed flows the way the reducer keys them. */
const bySymbol = (rows: ReserveFlows[]): Map<string, ReserveFlows> => new Map(rows.map((r) => [r.symbol, r]));

/** The six legs, in the names rails-server chose for the opening balance's own
 *  buckets — chosen to be exactly these field names, so the merge needs no
 *  translation table to drift out of date. */
const LEGS = ["supplied", "withdrawn", "borrowed", "repaid", "liquidatedCollateral", "liquidatedDebt"] as const;

/**
 * The lifetime flows for a WINDOWED page: the opening balance seeded first, the
 * folders the index served added next, the loaded rows added on top.
 *
 * Pass the result to `computeSparkEconomics` / `computeSparkCardCaptions` as
 * `precomputedLifetime`, and to `unpricedSparkFlowAddresses` so a reserve the
 * position only ever touched below the cut still gets its oracle price.
 *
 * The three halves never overlap: the opening balance covers `block_number <
 * cutoffBlock`, every event passed in is at or after it, and a folder's members
 * are exactly the events at or after it that arrived as a folder instead of as
 * their own rows. So summing them is addition and not reconciliation.
 * `folders` is empty (or omitted) on a load that opted out with `?folders=0`.
 *
 * ⚠️ A leg the opening balance cannot scale — no decimals for its reserve — is
 * NOT added as zero. Its reserve is dropped from the lifetime layer entirely, so
 * the tower shows nothing for it rather than a total that is short by whatever
 * the summarised part held. That is the same choice the reducer already makes
 * for an unpriced reserve: refuse the line, never state a partial one.
 */
export function sparkLifetimeWithOpening(
  events: BaseActivityEvent[],
  opening: TimelineOpeningBalance | null | undefined,
  folders?: readonly ServedFolder[] | null,
): ReserveFlows[] | undefined {
  // Undefined = there is NOTHING outside `events`, so the reducer should read
  // them as the whole history and this layer should not exist. A grouped answer
  // with no cut is exactly that case minus the folders: its events are not the
  // whole history either, so folders alone are reason enough to build it.
  if (!opening && (folders?.length ?? 0) === 0) return undefined;
  const merged = new Map<string, ReserveFlows>();
  const get = (symbol: string, address?: string): ReserveFlows => {
    const cur = merged.get(symbol) ?? {
      symbol,
      supplied: 0,
      withdrawn: 0,
      borrowed: 0,
      repaid: 0,
      liquidatedCollateral: 0,
      liquidatedDebt: 0,
    };
    if (address && !cur.address) cur.address = address.toLowerCase();
    merged.set(symbol, cur);
    return cur;
  };

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
    if (!scalable) continue;
    const r = get(bucket.key, bucket.sourceKey);
    for (const leg of LEGS) r[leg] += scaled[leg] ?? 0;
  }

  for (const [symbol, windowFlows] of reduceSparkLifetime(events)) {
    const r = get(symbol, windowFlows.address);
    for (const leg of LEGS) r[leg] += windowFlows[leg];
  }

  return [...merged.values()];
}

/** Chain-faithful interest on one leg (the V3 legInterest gates):
 *  - no chain-state current / no gross inflow → can't attribute, bail;
 *  - interest < dust → zero (or negative: missed principal, bail);
 *  - interest > grossIn → >100% cumulative yield, physically implausible
 *    (a transfer-in fed the balance — custody moves are deliberately not
 *    flows, so the inflow is absent from grossIn) → bail. */
function legInterest(current: number | undefined, netPrincipal: number, grossIn: number): number {
  if (current == null || grossIn <= 0) return 0;
  const interest = current - netPrincipal;
  if (interest < DUST) return 0;
  if (interest > grossIn) return 0;
  return interest;
}

/** Reserve addresses contributing lifetime-flow lines that `priceByAddress`
 *  doesn't price — the exited/liquidated reserves the listing row (current
 *  reserves only) can't know about. The detail page prices these through
 *  /api/chain/spark/oracle-prices and merges the result, so the tower's
 *  strict per-total guard can value a multi-reserve history instead of
 *  degrading the whole panel to the gated token list. */
export function unpricedSparkFlowAddresses(
  view: SparkPositionView,
  events: BaseActivityEvent[],
  /** The merged lifetime on a windowed page. Without it the top-up set is the
   *  window's reserves alone, and a wallet whose oldest reserves are all in the
   *  opening balance would leave the tower's strict per-total guard gating the
   *  whole ECONOMICS panel. */
  precomputed?: ReserveFlows[],
): string[] {
  const lifetime = precomputed ? bySymbol(precomputed) : reduceSparkLifetime(events);
  const out = new Set<string>();
  for (const f of lifetime.values()) {
    if (!f.address) continue; // no address → unpriceable either way
    const a = f.address.toLowerCase();
    const p = view.priceByAddress?.[a];
    if (typeof p === "number" && p > 0) continue;
    const flows = f.supplied + f.withdrawn + f.borrowed + f.repaid + f.liquidatedCollateral + f.liquidatedDebt;
    if (flows > DUST) out.add(a);
  }
  return [...out];
}

/** The liquidation read beneath the HF stat — shared by the card's footnote
 *  and the LLM export so the two agree number-for-number. One supplied reserve
 *  carrying ≥99.5% of the oracle-priced collateral anchors a single-asset
 *  liquidation price (oracle price ÷ HF — both legs on-chain; dust doesn't
 *  block the anchor); otherwise the 1 − 1/HF combined-collateral drop.
 *  All-null when there's no debt/HF, HF ≤ 1 (the HF value itself says
 *  liquidatable), or HF reads ∞. */
export interface SparkLiquidationRead {
  /** How far the whole collateral basket can fall before HF 1.0 (percent). */
  dropPct: number | null;
  /** The single-collateral anchor, when one reserve dominates. */
  single: { symbol: string; price: number; liqPrice: number } | null;
}

export function sparkLiquidationRead(view: SparkPositionView): SparkLiquidationRead {
  const hf = view.healthFactor;
  if (hf == null || hf <= 1 || hf >= 100) return { dropPct: null, single: null };
  const prices = view.priceByAddress;
  const priced = view.supplies
    .filter((r) => r.amount > 0)
    .map((r) => {
      const p = prices?.[r.address.toLowerCase()];
      return { r, price: typeof p === "number" && p > 0 ? p : null };
    });
  let single: SparkLiquidationRead["single"] = null;
  if (priced.length > 0 && priced.every((p) => p.price != null)) {
    const valued = priced.map((p) => ({ ...p, usd: (p.price as number) * p.r.amount }));
    const total = valued.reduce((s, p) => s + p.usd, 0);
    const top = valued.reduce((a, b) => (b.usd > a.usd ? b : a));
    if (total > 0 && top.usd / total >= 0.995) {
      single = { symbol: top.r.symbol, price: top.price as number, liqPrice: (top.price as number) / hf };
    }
  }
  return { dropPct: (1 - 1 / hf) * 100, single };
}

/** Position-card stat captions (the V4 spoke-card grammar, computed with this
 *  tier's gates). null = the gate failed and the caption simply doesn't render. */
export interface SparkCardCaptions {
  /** USD of accrued supply interest included in the collateral balance. */
  supplyInterestUsd: number | null;
  /** USD of accrued borrow interest included in the debt balance. */
  debtInterestUsd: number | null;
  /** Current variable borrow APR (%). `avg` when debt-USD-weighted across
   *  several borrowed reserves; `symbol` names the reserve when single. */
  borrowRate: { pct: number; avg: boolean; symbol?: string } | null;
}

/** USD of accrued interest included in one side's balance — per live reserve,
 *  (current rebased balance − net event principal) × oracle price, summed.
 *  STRICT: a reserve that can't attribute (no captured inflow, negative
 *  interest = missed principal, interest > gross inflow = a transfer-fed
 *  balance whose custody moves are deliberately not flows, or an unpriced
 *  reserve) nulls the whole caption rather than understate it; a genuinely
 *  ~zero interest just contributes nothing. */
function sideInterestUsd(
  side: "supply" | "debt",
  view: SparkPositionView,
  lifetime: Map<string, ReserveFlows> | null,
  usdOf: (address: string | undefined, amount: number) => number | null,
): number | null {
  if (!lifetime) return null;
  const live = (side === "supply" ? view.supplies : view.borrows).filter((r) => r.amount > 0);
  if (live.length === 0) return null;
  let sum = 0;
  for (const cur of live) {
    const f = lifetime.get(cur.symbol);
    if (!f) return null;
    const gross = side === "supply" ? f.supplied : f.borrowed;
    const net =
      side === "supply" ? f.supplied - f.withdrawn - f.liquidatedCollateral : f.borrowed - f.repaid - f.liquidatedDebt;
    if (gross <= 0) return null;
    const interest = cur.amount - net;
    if (interest < -DUST || interest > gross) return null;
    if (interest <= DUST) continue;
    const usd = usdOf(cur.address, interest);
    if (usd == null) return null;
    sum += usd;
  }
  return sum;
}

export function computeSparkCardCaptions(
  view: SparkPositionView,
  events?: BaseActivityEvent[],
  chain?: SparkPositionChainResponse | null,
  /** Lifetime gross flows computed elsewhere over the WHOLE history — the
   *  windowed page hands these in (its event list is the window), and the
   *  interest split then attributes against the whole life rather than a recent
   *  slice. When present `events` is not reduced here at all. */
  precomputedLifetime?: ReserveFlows[],
): SparkCardCaptions {
  const prices = view.priceByAddress;
  const usdOf = (address: string | undefined, amount: number): number | null => {
    if (!address) return null;
    const p = prices?.[address.toLowerCase()];
    return typeof p === "number" && p > 0 ? amount * p : null;
  };
  const lifetime = precomputedLifetime
    ? bySymbol(precomputedLifetime)
    : events && events.length > 0
      ? reduceSparkLifetime(events)
      : null;

  // Borrow rate — from the live Pool read (getReserveData @ head). One borrowed
  // reserve → its own rate; several → the debt-USD-weighted average, with the
  // strict guard (every borrowed reserve rated AND oracle-priced, else omit).
  let borrowRate: SparkCardCaptions["borrowRate"] = null;
  if (chain && !chain.chainStale) {
    const borrowed = chain.reserves.filter((r) => r.hasBorrow && r.debtBalanceRaw !== "0");
    if (borrowed.length === 1 && borrowed[0].borrowApr != null) {
      borrowRate = { pct: borrowed[0].borrowApr * 100, avg: false, symbol: borrowed[0].symbol };
    } else if (borrowed.length > 1 && borrowed.every((r) => r.borrowApr != null)) {
      let wSum = 0;
      let rSum = 0;
      for (const r of borrowed) {
        const w = usdOf(r.address, scaleSparkChainBalance(r.debtBalanceRaw, r.decimals));
        if (w == null || w <= 0) {
          wSum = 0;
          break;
        }
        wSum += w;
        rSum += (r.borrowApr as number) * w;
      }
      if (wSum > 0) borrowRate = { pct: (rSum / wSum) * 100, avg: true };
    }
  }

  return {
    supplyInterestUsd: sideInterestUsd("supply", view, lifetime, usdOf),
    debtInterestUsd: sideInterestUsd("debt", view, lifetime, usdOf),
    borrowRate,
  };
}

export function computeSparkEconomics(
  view: SparkPositionView,
  events?: BaseActivityEvent[],
  /** Lifetime gross flows computed elsewhere, over a history longer than the
   *  events passed in. When present these are used verbatim and `events` is
   *  ignored for the lifetime layer — which is the point: a windowed page
   *  renders the most recent slice of a long history, and the totals must still
   *  be the whole of it. */
  precomputedLifetime?: ReserveFlows[],
): ChainTruthTowerData {
  const prices = view.priceByAddress;
  const usdOf = (address: string | undefined, amount: number): number | null => {
    if (!address) return null;
    const p = prices?.[address.toLowerCase()];
    return typeof p === "number" && p > 0 ? amount * p : null;
  };

  const supplyLines: TowerLine[] = view.supplies
    .filter((r) => r.amount > 0)
    .map((r) => ({
      key: r.address,
      symbol: r.symbol,
      amount: r.amount,
      usd: usdOf(r.address, r.amount),
      prov: positionSupplyProv(r.symbol, view.atBlock),
    }));

  const debtLines: TowerLine[] = view.borrows
    .filter((r) => r.amount > 0)
    .map((r) => ({
      key: r.address,
      symbol: r.symbol,
      amount: r.amount,
      usd: usdOf(r.address, r.amount),
      prov: positionDebtProv(r.symbol, view.atBlock),
    }));

  // ── Lifetime layer (needs the event stream) ────────────────────────────────
  const lifetime = precomputedLifetime
    ? bySymbol(precomputedLifetime)
    : events && events.length > 0
      ? reduceSparkLifetime(events)
      : null;
  const flowLines = (
    pick: (r: ReserveFlows) => number,
    flow: "withdrawn" | "repaid" | "liquidated collateral" | "liquidated debt",
    keyPrefix: string,
  ): TowerLine[] =>
    lifetime
      ? [...lifetime.values()]
          .filter((r) => pick(r) > DUST)
          .map((r) => ({
            key: `${keyPrefix}-${r.symbol}`,
            symbol: r.symbol,
            amount: pick(r),
            usd: usdOf(r.address, pick(r)),
            prov: sparkLifetimeFlowProv(flow, r.symbol),
          }))
      : [];

  const collExited = flowLines((r) => r.withdrawn, "withdrawn", "coll-withdrawn");
  const collLiquidated = flowLines((r) => r.liquidatedCollateral, "liquidated collateral", "coll-liq");
  const debtExited = flowLines((r) => r.repaid, "repaid", "debt-repaid");
  const debtLiquidated = flowLines((r) => r.liquidatedDebt, "liquidated debt", "debt-liq");

  // Interest segment — only on a SINGLE-reserve debt side (one symbol, one
  // honest token amount; a cross-reserve token sum would be meaningless). The
  // tower stacks `current + interest` as the total, so when the split engages
  // the current line must DROP to the net event principal — the rebased balance
  // already includes the interest (principal + accrued = balanceOf, verified
  // against the variableDebtToken on-chain).
  let interest: TowerLine | null = null;
  if (lifetime && debtLines.length === 1) {
    const cur = debtLines[0];
    const f = lifetime.get(cur.symbol);
    if (f) {
      const net = f.borrowed - f.repaid - f.liquidatedDebt;
      const amt = legInterest(cur.amount, net, f.borrowed);
      if (amt > 0) {
        interest = {
          key: "debt-interest",
          symbol: cur.symbol,
          amount: amt,
          usd: usdOf(cur.key, amt),
          prov: sparkDebtInterestProv(cur.symbol),
        };
        debtLines[0] = {
          ...cur,
          amount: net,
          usd: usdOf(cur.key, net),
          prov: sparkDebtPrincipalProv(cur.symbol),
        };
      }
    }
  }

  // Value the tower only when EVERY contributing line is oracle-priced — a strict
  // per-total guard. A single unpriced reserve drops it to the token gated list,
  // so a bar height is never a partial (misleading) USD figure.
  const contributing = [
    ...supplyLines,
    ...debtLines,
    ...collExited,
    ...collLiquidated,
    ...debtExited,
    ...debtLiquidated,
    ...(interest ? [interest] : []),
  ];
  const valued = contributing.length > 0 && contributing.every((l) => l.usd != null);

  // Lifetime inflow (the faded side bar) — USD when valued; a token amount is
  // only meaningful when one reserve flowed, else suppressed.
  const inflow = (pick: (r: ReserveFlows) => number): number => {
    if (!lifetime) return 0;
    const rows = [...lifetime.values()].filter((r) => pick(r) > DUST);
    if (rows.length === 0) return 0;
    if (valued) return rows.reduce((s, r) => s + (usdOf(r.address, pick(r)) ?? 0), 0);
    return rows.length === 1 ? pick(rows[0]) : 0;
  };

  return {
    valued,
    // On-chain oracle price → chain-derived, so the USD bars survive On-chain-values.
    priceKind: valued ? "chain-derived" : undefined,
    collateral: {
      current: supplyLines,
      interest: null,
      exited: collExited,
      liquidated: collLiquidated,
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
      interest != null
        ? undefined
        : "Balances include the interest built up since each supply and borrow, so every figure is what the position holds now rather than the amount originally moved. The split between principal and accrued interest is shown only when the debt is a single asset whose history adds up cleanly. Dollar values use SparkLend's own price for each asset.",
  };
}
