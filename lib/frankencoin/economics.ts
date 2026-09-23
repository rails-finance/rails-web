// Frankencoin economics reduction — the dual tower in NATIVE UNITS.
// ----------------------------------------------------------------------------
// Frankencoin runs no oracle, so the tower runs in TOKEN MODE (valued=false):
// the collateral side stacks in the position's own token, the debt side in
// ZCHF, and the two towers are NOT height-comparable — the component labels
// them so. No USD is computed anywhere in this file, by charter.
//
// Current lines come from the card view (the live chain read where it landed,
// the latest MintingUpdate absolute otherwise — the provenance asserts which).
// Lifetime flows replay the ledger's own per-event changes (differences of
// two emitted absolutes): mints / repays on the ZCHF side, adds / withdrawals
// on the collateral side, with AUCTION write-downs (a MintingUpdate in a
// challenge-settlement or forced-sale tx) bucketed as involuntary.
//
// There is deliberately NO accrued-interest lane: Frankencoin charges
// interest UP FRONT at minting time, so no interest ever accrues on an open
// position — the interestNote states the mechanic instead of gating.

import type { FrankencoinPositionView } from "@/components/protocol/frankencoin/frankencoin-position-card";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isFrankencoinEvent } from "@/lib/shared/types/event-shape";
import { latestAbsoluteProv, lifetimeFlowProv } from "@/lib/frankencoin/event-provenance";
import { liveMintedProv, liveCollateralProv } from "@/lib/frankencoin/live-provenance";
import { flowsReconcile, type ChainTruthTowerData, type TowerLine } from "@/lib/shared/chain-truth-economics";
import { scaleBaseUnits, type TimelineOpeningBalance } from "@/lib/shared/timeline-opening-balance";

const DUST = 1e-9;

interface LifetimeFlows {
  minted: number;
  repaid: number;
  collateralAdded: number;
  collateralWithdrawn: number;
  /** Involuntary — the auction write-downs. */
  collateralAuctioned: number;
  debtClearedByAuction: number;
}

const num = (s?: string): number => {
  const n = Number(s ?? "0");
  return Number.isFinite(n) ? n : 0;
};

function replayLifetime(events: BaseActivityEvent[]): LifetimeFlows {
  const f: LifetimeFlows = {
    minted: 0,
    repaid: 0,
    collateralAdded: 0,
    collateralWithdrawn: 0,
    collateralAuctioned: 0,
    debtClearedByAuction: 0,
  };
  for (const ev of events) {
    if (!isFrankencoinEvent(ev)) continue;
    const ctx = ev.context.data;
    // Only ledger rows move the tower — challenge slices are narrated by the
    // forensics card; counting both would double the auction's collateral.
    const isLedger =
      ctx.eventType === "open" ||
      ctx.eventType === "clone" ||
      ctx.eventType === "mint" ||
      ctx.eventType === "repay" ||
      ctx.eventType === "add_collateral" ||
      ctx.eventType === "withdraw_collateral" ||
      ctx.eventType === "adjust" ||
      ctx.eventType === "adjust_price" ||
      ctx.eventType === "auction_settlement" ||
      ctx.eventType === "close";
    if (!isLedger) continue;

    const isOpenRow = ctx.eventType === "open" || ctx.eventType === "clone";
    const dMint =
      ctx.minted != null && (ctx.mintedBefore != null || isOpenRow) ? num(ctx.minted) - num(ctx.mintedBefore) : null;
    // The V1 clone-creation lie: an understated collateral figure would mint
    // a phantom withdrawal — the collateral axis of that row is skipped.
    const dColl =
      !ctx.collateralUnderstated && ctx.collateral != null && (ctx.collateralBefore != null || isOpenRow)
        ? num(ctx.collateral) - num(ctx.collateralBefore)
        : null;

    const involuntary = ctx.eventType === "auction_settlement";
    if (dMint != null && dMint > 0) f.minted += dMint;
    if (dMint != null && dMint < 0) {
      if (involuntary) f.debtClearedByAuction += -dMint;
      else f.repaid += -dMint;
    }
    if (dColl != null && dColl > 0) f.collateralAdded += dColl;
    if (dColl != null && dColl < 0) {
      if (involuntary) f.collateralAuctioned += -dColl;
      else f.collateralWithdrawn += -dColl;
    }
  }
  return f;
}

/**
 * The lifetime flows for a WINDOWED page: the opening balance's own legs
 * seeded first, the loaded rows' replay added on top. The two halves never
 * overlap — the opening balance covers `block_number < cutoffBlock` and every
 * event passed in is at or after it — so summing them is addition, not
 * reconciliation, and the compute's per-side reconcile gates then check the
 * MERGED totals against the current figures exactly as they always have.
 *
 * The opening legs arrive as base-unit integer strings with their decimals
 * stated per bucket (18 for the ZCHF side, the roster's own load-bearing
 * collateral_decimals for the other — four observed collaterals are 0dp), and
 * the leg names are the LifetimeFlows fields verbatim, so the merge needs no
 * translation table. A leg that cannot be scaled returns undefined for the
 * WHOLE layer: a lifetime figure short by whatever the summarised part held
 * is a wrong answer, not a partial one.
 */
export function frankencoinLifetimeWithOpening(
  events: BaseActivityEvent[],
  opening: TimelineOpeningBalance | null | undefined,
): LifetimeFlows | undefined {
  if (!opening) return undefined;
  const f = replayLifetime(events);
  for (const bucket of opening.flows ?? []) {
    for (const [leg, raw] of Object.entries(bucket.legs)) {
      if (!(leg in f)) continue;
      const value = scaleBaseUnits(raw, bucket.decimals);
      if (value == null) return undefined;
      f[leg as keyof LifetimeFlows] += value;
    }
  }
  return f;
}

export function computeFrankencoinEconomics(
  view: FrankencoinPositionView,
  events?: BaseActivityEvent[],
  /** The merged whole-history flows on a windowed page (see
   *  frankencoinLifetimeWithOpening). Present, it IS the lifetime layer and
   *  `events` takes no part in it; absent, the events replay as they always
   *  did. A windowed page whose opening balance has not arrived passes
   *  NEITHER — the lifetime layer states nothing rather than a window's
   *  arithmetic. */
  precomputedLifetime?: LifetimeFlows,
): ChainTruthTowerData {
  const sym = view.collateralSymbol;

  const collProv =
    view.basis === "chain"
      ? liveCollateralProv(sym, view.position)
      : latestAbsoluteProv("collateral", sym, view.collateralDecimals);
  const mintProv = view.basis === "chain" ? liveMintedProv(view.position) : latestAbsoluteProv("minted", "ZCHF", 18);

  const supplyLines: TowerLine[] =
    view.collateral != null && view.collateral > DUST
      ? [{ key: "collateral", symbol: sym, amount: view.collateral, usd: null, prov: collProv }]
      : [];
  const debtLines: TowerLine[] =
    view.minted > DUST ? [{ key: "minted", symbol: "ZCHF", amount: view.minted, usd: null, prov: mintProv }] : [];

  const lifetime = precomputedLifetime ?? (events && events.length > 0 ? replayLifetime(events) : null);
  // Per-side reconcile gates (the morpho pattern): the replay deliberately
  // skips legs it can't trust (understated clone collateral, rows without a
  // recorded before), so a side's flows render only when they telescope back
  // to the side's current figure — a story that doesn't sum stays off the
  // tower rather than posing as all-time truth.
  const collOk =
    lifetime != null &&
    view.collateral != null &&
    flowsReconcile(
      lifetime.collateralAdded - lifetime.collateralWithdrawn - lifetime.collateralAuctioned,
      view.collateral,
      lifetime.collateralAdded + lifetime.collateralWithdrawn + lifetime.collateralAuctioned,
    );
  const debtOk =
    lifetime != null &&
    flowsReconcile(
      lifetime.minted - lifetime.repaid - lifetime.debtClearedByAuction,
      view.minted,
      lifetime.minted + lifetime.repaid + lifetime.debtClearedByAuction,
    );

  const line = (
    ok: boolean,
    key: string,
    symbol: string,
    amount: number,
    flow: Parameters<typeof lifetimeFlowProv>[0],
  ): TowerLine[] =>
    ok && lifetime && amount > DUST ? [{ key, symbol, amount, usd: null, prov: lifetimeFlowProv(flow, symbol) }] : [];

  return {
    // NEVER valued: Frankencoin is oracle-free — token mode by charter, each
    // side in its own native unit.
    valued: false,
    collateralUnit: sym,
    debtUnit: "ZCHF",
    // Not "principal": interest is prepaid at minting, so the minted figure
    // is the WHOLE debt — the label says exactly what the amount is.
    debtListLabel: "Debt · ZCHF minted",
    collateral: {
      current: supplyLines,
      interest: null,
      exited: line(collOk, "coll-withdrawn", sym, lifetime?.collateralWithdrawn ?? 0, "collateral withdrawn"),
      liquidated: line(collOk, "coll-auctioned", sym, lifetime?.collateralAuctioned ?? 0, "collateral auctioned"),
      lifetimeInflow: collOk ? (lifetime?.collateralAdded ?? 0) : 0,
    },
    debt: {
      current: debtLines,
      interest: null,
      exited: line(debtOk, "debt-repaid", "ZCHF", lifetime?.repaid ?? 0, "repaid"),
      liquidated: line(
        debtOk,
        "debt-auctioned",
        "ZCHF",
        lifetime?.debtClearedByAuction ?? 0,
        "debt cleared by auction",
      ),
      lifetimeInflow: debtOk ? (lifetime?.minted ?? 0) : 0,
    },
    interestNote:
      "Frankencoin charges interest at minting time — each mint deducts the fee for the remaining term up front, so no interest accrues on an open position and there is no principal-versus-interest split to draw. Units are native: ZCHF debt on one side, the position's own collateral token on the other. Frankencoin runs no oracle, so the two towers stack in different units and are not height-comparable. Lifetime flows are gross totals over the position's life; the interest charged up front at each mint isn't a separate line, and collateral or debt cleared by an auction is counted separately as involuntary.",
    flowsNote:
      lifetime != null
        ? undefined
        : "Lifetime flows for this position aren't available yet — they appear once its full history is in place.",
  };
}
