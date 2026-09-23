// f(x) V2 economics reduction — the token-mode tower with the socialized lane.
// ----------------------------------------------------------------------------
// Current lines are the SETTLED sweep only (the pool's own getPosition /
// getPositionDebtRatio views, read server-side at a named block): funding (the
// collateral index fed by Aave's borrow index), socialized rebalances
// (RebalanceTick / Rebalance; ticks also migrate via TickMovement) and
// bad-debt write-offs at liquidation all mutate positions with NO per-position
// event, so event replay CANNOT state current state — it is history only.
//
// The unique f(x) lane is the explicit SOCIALIZED reconciliation on the debt
// side: implied debt (Σ of the position's own event deltas) vs the settled
// debt (a direct chain read); the difference is socialized rebalances, write-offs &
// bad debt, rendered as its own line (spike-verified: wstETH #285 implied
// 25,178 fxUSD vs settled 0 — 24,931 socialized in a crash + a 246.85
// bad-debt write-off). An event-implied sum is NEVER presented as current
// state — pre-sweep the debt side stays empty with a note, not an implied
// stand-in.
//
// Token mode (valued: false): fxUSD is NOT $1-pinned (chain-truth charter §S3
// forbids convenience pins), so the debt tower is drawn in fxUSD token units
// and the two sides are not height-comparable. Collateral is the settled
// NORMALIZED unit (stETH-equivalent / WBTC-18dp). Collateral lifetime flows
// are deliberately absent: an operate's deltaColls is TOKEN units while the
// settled amount is NORMALIZED — the two systems never mix or sum — and
// funding mutates collateral eventlessly, so no replay reconciles. Suppressed,
// never mislabeled.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isFxEvent } from "@/lib/shared/types/event-shape";
import type { FxPositionSummary } from "@/lib/sources/api/fx-positions";
import {
  settledCollateralProv,
  settledDebtProv,
  socializedDebtProv,
  impliedDebtProv,
  fxLifetimeFlowProv,
} from "@/lib/fx/event-provenance";
import { type ChainTruthTowerData, type TowerLine, flowsReconcile } from "@/lib/shared/chain-truth-economics";
import { scaleBaseUnits, type TimelineOpeningBalance } from "@/lib/shared/timeline-opening-balance";

const DUST = 1e-9;

/** Lifetime gross fxUSD debt flows, replayed from the position's own events.
 *  Debt deltas are fxUSD everywhere (one unit system), so these sums are safe;
 *  collateral deltas are NOT summable against the settled amounts (token vs
 *  normalized units) and are deliberately not replayed here. */
interface FxDebtFlows {
  /** Σ positive operate debt deltas (fxUSD drawn). */
  borrowed: number;
  /** Σ |negative| operate debt deltas (fxUSD voluntarily repaid). */
  repaid: number;
  /** Σ |debt deltas| on liquidation rows (fxUSD + stable legs cleared). */
  liquidated: number;
}

function replayFxDebtFlows(events: BaseActivityEvent[]): FxDebtFlows {
  const flows: FxDebtFlows = { borrowed: 0, repaid: 0, liquidated: 0 };
  for (const ev of events) {
    if (!isFxEvent(ev)) continue;
    const d = ev.context.data;
    const delta = Number(d.debtDelta);
    if (!Number.isFinite(delta) || delta === 0) continue;
    if (d.eventType === "liquidation") {
      // A liquidation's debtDelta is −(fxUSDDebts + stableDebts) — the cleared
      // legs the log emitted. A terminal write-off beyond them left no field;
      // it lands in the socialized reconciliation, keeping the buckets exclusive.
      flows.liquidated += Math.abs(delta);
    } else if (delta > 0) {
      flows.borrowed += delta;
    } else {
      flows.repaid += -delta;
    }
  }
  return flows;
}

/**
 * The lifetime debt flows for a WINDOWED page: the opening balance's own legs
 * seeded first, the loaded rows' replay added on top. The two halves never
 * overlap — the opening balance covers the mv_fx_events lane below
 * `cutoffBlock` (the only lane the window cuts; the ownership and socialized
 * lanes ride the response whole), and every MV-lane event passed in is at or
 * after it — so summing them is addition, not reconciliation, and the
 * compute's reconcile-to-implied gate then checks the MERGED total exactly as
 * it always has. The legs arrive as base-unit fxUSD integers (18dp by
 * construction, stated on the bucket) under the FxDebtFlows names verbatim.
 * A leg that cannot be scaled returns undefined for the WHOLE layer.
 */
export function fxDebtFlowsWithOpening(
  events: BaseActivityEvent[],
  opening: TimelineOpeningBalance | null | undefined,
): FxDebtFlows | undefined {
  if (!opening) return undefined;
  const flows = replayFxDebtFlows(events);
  for (const bucket of opening.flows ?? []) {
    for (const [leg, raw] of Object.entries(bucket.legs)) {
      if (!(leg in flows)) continue;
      const value = scaleBaseUnits(raw, bucket.decimals);
      if (value == null) return undefined;
      flows[leg as keyof FxDebtFlows] += value;
    }
  }
  return flows;
}

/** Build the token-mode tower for one f(x) position from its summary (the
 *  settled sweep + the indexed implied lane) and, optionally, its event
 *  stream. With the events the debt side gains the lifetime layer (hatched
 *  repaid / liquidated segments and the faded inflow bar) — gated on the
 *  replayed net matching the summary's implied debt (a partial timeline page
 *  suppresses the flows rather than mislabel a window as all-time). The
 *  socialized line needs only the summary (implied − settled) and renders
 *  whenever the sweep has landed and the gap clears dust. */
export function computeFxEconomics(
  position: FxPositionSummary,
  events: BaseActivityEvent[] = [],
  /** The merged whole-history debt flows on a windowed page (see
   *  fxDebtFlowsWithOpening). Present, it IS the lifetime layer and `events`
   *  takes no part in it; absent, the events replay as they always did. A
   *  windowed page whose opening balance has not arrived passes NEITHER — the
   *  lifetime layer states nothing rather than a window's arithmetic. */
  precomputedLifetime?: FxDebtFlows,
): ChainTruthTowerData {
  const settledColls = position.settled.colls;
  const settledDebts = position.settled.debts;
  const settledBlock = position.settled.block;
  const implied = position.impliedDebt.amount;
  // implied − settled: positive = debt left the position with no event
  // (rebalances / write-offs); negative = debt accrued beyond the event record.
  const socialized = position.socializedDebt ?? (settledDebts != null ? implied - settledDebts : null);

  // ── Collateral: the settled line only (NORMALIZED units) ──────────────────
  const collateralCurrent: TowerLine[] =
    settledColls != null && settledColls > DUST
      ? [
          {
            key: "settled-colls",
            symbol: position.normalizedSymbol,
            amount: settledColls,
            usd: null,
            prov: settledCollateralProv(position.normalizedSymbol, settledBlock),
          },
        ]
      : [];

  // ── Debt: settled truth + the socialized reconciliation ───────────────────
  const debtCurrent: TowerLine[] = [];
  let debtInterest: TowerLine | null = null;
  const debtExited: TowerLine[] = [];
  const debtLiquidated: TowerLine[] = [];
  let debtInflow = 0;

  if (settledDebts != null && socialized != null) {
    if (settledDebts > DUST) {
      debtCurrent.push({
        key: "settled-debts",
        symbol: "fxUSD",
        amount: settledDebts,
        usd: null,
        prov: settledDebtProv(settledBlock),
      });
    }

    if (socialized > DUST) {
      // Debt that left the position with no per-position event — involuntary,
      // so it stacks in the forward-diagonal bucket beside liquidated debt,
      // with its own caption.
      debtLiquidated.push({
        key: "debt-socialized",
        symbol: "fxUSD",
        amount: socialized,
        usd: null,
        prov: socializedDebtProv("cleared", settledBlock),
        flowLabel: "Socialized rebalances, write-offs & bad debt",
      });
    } else if (socialized < -DUST) {
      // Settled exceeds implied: debt accrued beyond the event record. The
      // tower stacks current + interest as the total, so the current line
      // DROPS to the event-implied principal and the eventless accrual rides
      // the interest segment — the stack still sums to the settled truth.
      // When the implied Σ has run BELOW zero (the events cleared debt that
      // bad debt socialized from other positions' liquidations had added
      // silently), the principal floor is zero and the
      // segment clamps to the settled figure itself — the stack must never
      // assert more debt than the pool does. The card's reconciliation line
      // still carries the full unclamped gap.
      const principal = Math.max(0, implied);
      debtCurrent.length = 0;
      if (principal > DUST) {
        debtCurrent.push({
          key: "implied-principal",
          symbol: "fxUSD",
          amount: principal,
          usd: null,
          prov: impliedDebtProv(),
        });
      }
      debtInterest = {
        key: "debt-socialized-accrual",
        symbol: "fxUSD",
        amount: Math.min(-socialized, settledDebts),
        usd: null,
        prov: socializedDebtProv("accrued", settledBlock, implied < 0),
      };
    }

    // Lifetime layer — only when the passed events replay to the summary's
    // implied debt (i.e. they cover the WHOLE captured history, not a page).
    if (precomputedLifetime || events.length > 0) {
      const flows = precomputedLifetime ?? replayFxDebtFlows(events);
      const net = flows.borrowed - flows.repaid - flows.liquidated;
      if (flowsReconcile(net, implied, flows.borrowed + flows.repaid + flows.liquidated)) {
        if (flows.repaid > DUST) {
          debtExited.push({
            key: "debt-repaid",
            symbol: "fxUSD",
            amount: flows.repaid,
            usd: null,
            prov: fxLifetimeFlowProv("repaid"),
          });
        }
        if (flows.liquidated > DUST) {
          debtLiquidated.unshift({
            key: "debt-liquidated",
            symbol: "fxUSD",
            amount: flows.liquidated,
            usd: null,
            prov: fxLifetimeFlowProv("liquidated debt"),
          });
        }
        debtInflow = flows.borrowed;
      }
    }
  }

  const preSweep = settledDebts == null && settledColls == null;

  return {
    // fxUSD is not $1-pinned and the pool oracle prices NORMALIZED collateral
    // only — no chain-faithful shared USD axis, so the tower stays in token mode.
    valued: false,
    collateral: {
      current: collateralCurrent,
      interest: null,
      // No collateral flows: deltaColls is TOKEN units vs the settled
      // NORMALIZED amount (the systems never mix), and funding mutates
      // collateral with no event — no replay reconciles. Suppressed, never
      // mislabeled.
      exited: [],
      liquidated: [],
      lifetimeInflow: 0,
    },
    debt: {
      current: debtCurrent,
      interest: debtInterest,
      exited: debtExited,
      liquidated: debtLiquidated,
      lifetimeInflow: debtInflow,
    },
    collateralUnit: position.normalizedSymbol,
    debtUnit: "fxUSD",
    collateralListLabel: "Collateral · settled",
    debtListLabel: "Debt · settled (fxUSD)",
    // The eventless growth riding the interest segment is f(x)'s socialized
    // lane, not interest — the caption names the page's own vocabulary.
    interestLabel: "Socialized accrual",
    interestNote:
      debtInterest != null
        ? undefined
        : preSweep
          ? "This position's current collateral and debt aren't in yet — f(x) reads them straight from the pool. Its own events can't stand in for them: funding on collateral, and rebalances and write-offs on debt, all change the real amounts with no per-position record, so the event-implied running debt is history, never the live figure."
          : "The current lines are read straight from the pool, funding and rebalances already applied. The hatched segment is the gap between what this position's own events add up to and that live figure: tick and pool rebalances, bad-debt write-offs, and bad debt socialized from other positions' liquidations, none of which leave a per-position record. Debt is shown in fxUSD tokens. fxUSD is not pinned to a dollar, so it is never restated as USD.",
  };
}
