// Asymmetry economics — the single-Trove tower, valued at the branch's own oracle.
// ----------------------------------------------------------------------------
// An Asymmetry Trove is single-collateral (its branch token) + single-debt (USDaf).
// Since the 2026-07 depth pass the listing row carries its branch's OWN
// PriceFeed price, so the tower values both sides: collateral at the oracle
// price (chain-derived — the same price the branch liquidates and redeems
// with), debt at USDaf's $1 redemption face (the protocol's own mechanism).
// When the branch is unpriced (RPC down) the tower degrades to the gated
// amount list — a strict guard, never a partial USD total. Unlike Liquity V1,
// Asymmetry charges a user-set annual interest rate, so the USDaf figure is the
// Trove's debt as last emitted (batched debt derived from batch shares) — the
// live entire-debt read rides the detail page's chain lane.
//
// Lifetime flows replay the same timeline the page renders below the tower:
// TroveUpdated emits absolutes, so each event's signed delta is exact
// arithmetic over two consecutive recorded balances, with redemptions and
// liquidations kept apart from the voluntary flows. The sums render only when
// the full replay reconciles to the latest recorded balances on both sides —
// a partial capture must not pose as an all-time history. Positive debt
// deltas include upfront fees and interest applied at each touch (the
// V2-family anatomy); the receipts and the note say so.

import type { AsymmetryTroveView } from "@/components/protocol/asymmetry/asymmetry-position-card";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isAsymmetryEvent } from "@/lib/shared/types/event-shape";
import { positionCollateralProv, positionDebtProv, lifetimeFlowProv } from "@/lib/asymmetry/event-provenance";
import type { LiquityForkLifetimeFlow } from "@/lib/shared/liquity-fork-provenance";
import { DEBT_SYMBOL } from "@/lib/asymmetry/asset-catalog";
import { flowsReconcile, type ChainTruthTowerData, type TowerLine } from "@/lib/shared/chain-truth-economics";
import { scaleBaseUnits, type TimelineOpeningBalance } from "@/lib/shared/timeline-opening-balance";

const DUST = 1e-9;

/** Lifetime gross flows on both axes, replayed from the Trove's own signed
 *  deltas. Redemptions and liquidations are kept apart from the voluntary
 *  flows — each is its own legend row. */
interface TroveFlows {
  deposited: number; // collateral in (open / top-ups)
  withdrawn: number; // collateral out, voluntary (adjust / close)
  collLiquidated: number; // collateral seized by liquidation
  collRedeemed: number; // collateral exchanged away by redemptions
  borrowed: number; // USDaf debt added (draws + upfront fees + applied interest)
  repaid: number; // USDaf repaid, voluntary
  debtLiquidated: number; // USDaf cleared by liquidation
  debtRedeemed: number; // USDaf repaid by redemptions
}

function replayLifetime(events: BaseActivityEvent[]): TroveFlows {
  const f: TroveFlows = {
    deposited: 0,
    withdrawn: 0,
    collLiquidated: 0,
    collRedeemed: 0,
    borrowed: 0,
    repaid: 0,
    debtLiquidated: 0,
    debtRedeemed: 0,
  };
  for (const ev of events) {
    if (!isAsymmetryEvent(ev)) continue;
    const ctx = ev.context.data;
    const collDelta = Number(ctx.collDelta) || 0;
    const debtDelta = Number(ctx.debtDelta) || 0;
    if (ctx.eventType === "liquidate") {
      f.collLiquidated += Math.abs(Math.min(collDelta, 0));
      f.debtLiquidated += Math.abs(Math.min(debtDelta, 0));
      continue;
    }
    if (ctx.eventType === "redeemCollateral") {
      f.collRedeemed += Math.abs(Math.min(collDelta, 0));
      f.debtRedeemed += Math.abs(Math.min(debtDelta, 0));
      continue;
    }
    if (collDelta > 0) f.deposited += collDelta;
    else f.withdrawn += -collDelta;
    if (debtDelta > 0) f.borrowed += debtDelta;
    else f.repaid += -debtDelta;
  }
  return f;
}

/**
 * The lifetime flows for a WINDOWED page: the opening balance's own legs
 * seeded first, the loaded rows' replay added on top. The two halves never
 * overlap — the opening balance covers `block_number < cutoffBlock` and every
 * event passed in is at or after it — so summing them is addition, not
 * reconciliation, and the compute's own reconcile gate then checks the MERGED
 * total against the latest recorded balances exactly as it always has.
 *
 * The opening legs arrive as base-unit integer strings with their decimals
 * stated per bucket (the branch's own for collateral — the BTC branches are 8
 * — and the 18-decimal stable for debt), and the leg names are the TroveFlows
 * fields verbatim, so the merge needs no translation table. A leg that cannot
 * be scaled returns undefined for the WHOLE layer: a lifetime figure short by
 * whatever the summarised part held is a wrong answer, not a partial one.
 */
export function asymmetryLifetimeWithOpening(
  events: BaseActivityEvent[],
  opening: TimelineOpeningBalance | null | undefined,
): TroveFlows | undefined {
  if (!opening) return undefined;
  const f = replayLifetime(events);
  for (const bucket of opening.flows ?? []) {
    for (const [leg, raw] of Object.entries(bucket.legs)) {
      if (!(leg in f)) continue;
      const value = scaleBaseUnits(raw, bucket.decimals);
      if (value == null) return undefined;
      f[leg as keyof TroveFlows] += value;
    }
  }
  return f;
}

export function computeAsymmetryEconomics(
  view: AsymmetryTroveView,
  events?: BaseActivityEvent[],
  /** The merged whole-history flows on a windowed page (see
   *  asymmetryLifetimeWithOpening). Present, it IS the lifetime layer and
   *  `events` takes no part in it; absent, the events replay as they always
   *  did. A windowed page whose opening balance has not arrived passes
   *  NEITHER — the lifetime layer states nothing rather than a window's
   *  arithmetic. */
  precomputedLifetime?: TroveFlows,
): ChainTruthTowerData {
  const coords = {
    collateralType: view.collateralType,
    blockNumber: view.atBlock,
    troveId: view.id,
    isBatched: view.isBatched,
  };
  // Strict per-total guard: value ONLY when every contributing line can be
  // priced — the collateral needs the branch price; the debt's $1 face rides
  // along with it (a lone face-valued debt would be a half-valued tower).
  const priced = view.priceUsd != null && view.priceUsd > 0;
  const usdOf = (symbol: string, amount: number): number | null =>
    !priced ? null : symbol === DEBT_SYMBOL ? amount : amount * (view.priceUsd as number);

  const line = (
    key: string,
    symbol: string,
    amount: number,
    prov: TowerLine["prov"],
    flowLabel?: string,
    flowKind?: TowerLine["flowKind"],
  ): TowerLine => ({
    key,
    symbol,
    amount,
    usd: usdOf(symbol, amount),
    prov,
    ...(flowLabel ? { flowLabel } : {}),
    ...(flowKind ? { flowKind } : {}),
  });

  const collateral: TowerLine[] =
    view.collateral > 0
      ? [line(view.collateralType, view.collateralType, view.collateral, positionCollateralProv(coords))]
      : [];
  const debt: TowerLine[] = view.debt > 0 ? [line(DEBT_SYMBOL, DEBT_SYMBOL, view.debt, positionDebtProv(coords))] : [];

  // ── Lifetime layer — only when the replayed flows reconcile to the latest
  //    recorded balances (a partial capture must not pose as all-time truth). ──
  const f = precomputedLifetime ?? (events && events.length > 0 ? replayLifetime(events) : null);
  const reconciles =
    f != null &&
    flowsReconcile(
      f.deposited - f.withdrawn - f.collLiquidated - f.collRedeemed,
      view.collateral,
      f.deposited + f.withdrawn + f.collLiquidated + f.collRedeemed,
    ) &&
    flowsReconcile(
      f.borrowed - f.repaid - f.debtLiquidated - f.debtRedeemed,
      view.debt,
      f.borrowed + f.repaid + f.debtLiquidated + f.debtRedeemed,
    );

  const flowLine = (
    amount: number,
    symbol: string,
    key: string,
    flow: LiquityForkLifetimeFlow,
    label?: string,
    flowKind?: TowerLine["flowKind"],
  ): TowerLine[] =>
    reconciles && amount > DUST ? [line(key, symbol, amount, lifetimeFlowProv(flow, coords), label, flowKind)] : [];

  const collExited = flowLine(f?.withdrawn ?? 0, view.collateralType, "coll-withdrawn", "withdrawn");
  const collLiquidated = [
    ...flowLine(f?.collLiquidated ?? 0, view.collateralType, "coll-liq", "liquidated collateral"),
    ...flowLine(
      f?.collRedeemed ?? 0,
      view.collateralType,
      "coll-redeemed",
      "redeemed collateral",
      "Redeemed",
      "redeemed",
    ),
  ];
  const debtExited = flowLine(f?.repaid ?? 0, DEBT_SYMBOL, "debt-repaid", "repaid");
  const debtLiquidated = [
    ...flowLine(f?.debtLiquidated ?? 0, DEBT_SYMBOL, "debt-liq", "liquidated debt"),
    ...flowLine(f?.debtRedeemed ?? 0, DEBT_SYMBOL, "debt-redeemed", "redeemed debt", "Redeemed", "redeemed"),
  ];

  const contributing = [...collateral, ...debt, ...collExited, ...collLiquidated, ...debtExited, ...debtLiquidated];
  const valued = contributing.length > 0 && contributing.every((l) => l.usd != null);

  const inflow = (amount: number, symbol: string): number => {
    if (!reconciles || amount <= DUST) return 0;
    return valued ? (usdOf(symbol, amount) ?? 0) : amount;
  };

  return {
    valued,
    // The branch's own PriceFeed → chain-derived, so the USD bars survive
    // On-chain-values; the debt leg is the $1 redemption face.
    priceKind: valued ? "chain-derived" : undefined,
    collateral: {
      current: collateral,
      interest: null,
      exited: collExited,
      liquidated: collLiquidated,
      lifetimeInflow: inflow(f?.deposited ?? 0, view.collateralType),
    },
    debt: {
      current: debt,
      interest: null,
      exited: debtExited,
      liquidated: debtLiquidated,
      lifetimeInflow: inflow(f?.borrowed ?? 0, DEBT_SYMBOL),
    },
    collateralListLabel: `Collateral · ${view.collateralType}`,
    debtListLabel: `Debt · ${DEBT_SYMBOL}`,
    flowsNote:
      "The tower shows the position as it stands; every inflow and outflow that produced it is in the timeline below, event by event.",
    interestNote: valued
      ? "Asymmetry is a Liquity V2 fork: each Trove carries its own annual interest rate. The USDaf figure is the Trove's debt at its last change — interest built up since isn't counted here, and the position card shows the live total. Collateral is valued at the branch's own price and the debt at USDaf's $1 redemption face, the protocol's own reckoning on both sides. Lifetime bars sum the Trove's own recorded deltas; the borrowed total counts every debt increase its events recorded — new draws, upfront fees, and interest applied when an operation touched the Trove."
      : "Asymmetry is a Liquity V2 fork: each Trove carries its own annual interest rate. The USDaf figure is the Trove's debt at its last change; interest built up since isn't counted here. The branch's price wasn't available on this load, so the tower shows amounts only — it never asserts a partial dollar total. Lifetime bars sum the Trove's own recorded deltas; the borrowed total counts every debt increase its events recorded — new draws, upfront fees, and interest applied when an operation touched the Trove.",
  };
}
