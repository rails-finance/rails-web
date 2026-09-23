// Liquity V2 trove economics — feeds the shared <ChainTruthTower> (E9: retiring
// the last hand-rolled tower on the site; every other explorer already draws
// this component). `calculateEconomicsFromEvents` is the replay ported
// unchanged from the old components/protocol/liquity/trove-economics.tsx — it
// is the truth, not re-derived here. `computeLiquityEconomics` maps that
// replay onto ChainTruthTowerData: USD-valued when the branch's own oracle
// price is known (priceKind "chain-derived"), token mode otherwise, exactly
// mirroring lib/asymmetry/economics.ts (a Liquity V2 fork feeder — the
// closest model, single-collateral single-debt).
//
// Two segments have no home in the shared shape (every other protocol on the
// tower is a chain-state read, not a full lifetime replay with a redemption
// queue and delegate fees): `costs` (debt side — upfront + delegate fees, the
// further accrual sitting beside Accrued interest) and `claimable` (collateral
// side — liquidation surplus still withdrawable, a solid segment beside
// Current Collateral). Both are new optional fields on `TowerSideData` wired
// into components/shared/chain-truth-tower.tsx; a feeder that never sets them
// (every other protocol) renders exactly as it did before.
//
// Every figure below is the bespoke tower's own arithmetic, carried over
// verbatim — see the segment-mapping table in the E9 report. Every
// TowerLine's `prov` reuses one of the bespoke tower's own Provenance objects,
// imported from lib/liquity/economics-provenance.ts — split out because
// check-explainer-register.mjs scans this file's string literals for the
// plain-words register, and a sum receipt's formula legitimately carries "Σ".

import type { LiquityContext } from "@/lib/shared/types/protocols/liquity";
import type { TroveEconomics as TroveEconomicsType } from "@/types/api/trove";
import { calculateAccruedInterest } from "@/lib/liquity/utils/interest-calculator";
import { FORK_ALL_IDS } from "@/lib/shared/fork-config";
import type { ChainTruthTowerData, TowerLine } from "@/lib/shared/chain-truth-economics";
import {
  collCurrentProv,
  collWithdrawnProv,
  collRedeemedProv,
  collLiquidatedProv,
  collFeesReceivedProv,
  collClaimableProv,
  debtCurrentProv,
  debtInterestProv,
  debtRepaidProv,
  debtRedeemedProv,
  debtLiquidatedProv,
  debtUpfrontFeesProv,
  debtDelegateFeesProv,
} from "@/lib/liquity/economics-provenance";

const DUST = 1e-9;

/** Minimal event shape — works with both BaseActivityEvent and TimelineEvent */
export interface MinimalEvent {
  timestamp: number;
  context?: { protocol?: string; data?: unknown };
  gas?: { gasCostEth: number; gasCostUsd: number };
}

export function isLiquityMinimal(
  e: MinimalEvent,
): e is MinimalEvent & { context: { protocol: string; data: LiquityContext } } {
  const p = e.context?.protocol;
  return (p === "liquity-v2-troves" || FORK_ALL_IDS.has(p as string)) && !!e.context?.data;
}

export interface TroveMeta {
  collateralType: string;
  stablecoinSymbol: string;
  collateralAmount: number;
  currentDebt: number;
  interestRate: number;
  isInBatch: boolean;
  batchManagementFee: number;
  isZombie: boolean;
  lastActivityAt: number;
  status: "open" | "closed" | "liquidated";
  /** The most recent event's after-state — the row `collateralAmount` and
   *  `currentDebt` are read from, with its raw and origin when delivered. */
  latestState?: LiquityContext["stateAfter"];
}

// ---- Economics calculation from events — the replay, ported unchanged ----

export function calculateEconomicsFromEvents(
  events: MinimalEvent[],
): (TroveEconomicsType & { _meta: TroveMeta }) | null {
  const liquityEvents = events.filter(isLiquityMinimal);
  if (liquityEvents.length === 0) return null;

  // Find troves the wallet actually owns (opened or joined)
  const OPEN_OPS = new Set(["openTrove", "openTroveAndJoinBatch"]);
  const ownedTroveIds = new Set<string>();
  for (const e of liquityEvents) {
    const c = e.context.data;
    if (OPEN_OPS.has(c.operation) && c.troveId) ownedTroveIds.add(c.troveId);
  }

  // Separate third-party events (redeemer/liquidator acting on someone else's trove)
  // from trove-owner events (wallet's own trove operations). Use ownedTroveIds
  // membership rather than the presence of `troveOwner`/`redeemer` fields so
  // the predicate works for both wallet-scoped and trove-scoped event feeds —
  // on a trove page every event is on the displayed (owned) trove, so no
  // redemption gets mis-classified as "against another trove".
  const ownerEvents = liquityEvents.filter((e) => {
    const c = e.context.data;
    if (c.operation === "redeemCollateral" && c.troveId && !ownedTroveIds.has(c.troveId)) return false;
    if (c.operation === "liquidate" && c.troveId && !ownedTroveIds.has(c.troveId)) return false;
    return true;
  });

  // If no owner events remain, this wallet is a pure redeemer/liquidator — return null
  if (ownerEvents.length === 0) return null;

  // Sort chronologically
  const sorted = [...ownerEvents].sort((a, b) => a.timestamp - b.timestamp);
  const latest = sorted[sorted.length - 1];
  const ctx = latest.context.data;

  let totalBorrowed = 0;
  let totalRepaid = 0;
  let totalCollateralDeposited = 0;
  let totalCollateralWithdrawn = 0;
  let totalUpfrontFees = 0;
  let totalGasCostEth = 0;
  let totalGasCostUsd = 0;

  // Redemption metrics
  let redemptionDebtCleared = 0;
  let redemptionCollLost = 0;
  let redemptionCollValue = 0;
  let redemptionFeesRetained = 0;
  let hasRedemptions = false;

  // Liquidation metrics
  let liquidationDebtCleared = 0;
  let liquidationCollSurplus = 0;
  let hasLiquidations = false;

  for (const event of sorted) {
    const c = event.context.data;

    // Gas — only count gas the Trove owner actually paid. Passive events
    // (redemption/liquidation/pending-debt application) are sent by a third party
    // (the redeemer or liquidator pays), so their gas is not the owner's cost.
    const isPassiveOp =
      c.operation === "redeemCollateral" || c.operation === "liquidate" || c.operation === "applyPendingDebt";
    if (event.gas && !isPassiveOp) {
      totalGasCostEth += event.gas.gasCostEth;
      totalGasCostUsd += event.gas.gasCostUsd;
    }

    if (c.operation === "redeemCollateral") {
      hasRedemptions = true;
      if (c.troveOperation) {
        const debtCleared = Math.abs(c.troveOperation.debtChangeFromOperation);
        redemptionDebtCleared += debtCleared;
        const collLost = Math.abs(c.troveOperation.collChangeFromOperation);
        redemptionCollLost += collLost;
        redemptionCollValue += collLost * c.collateralPrice;
      }
      if (c.redemption) {
        const fee = parseFloat(c.redemption.redemptionFee) || 0;
        redemptionFeesRetained += fee;
      }
      continue;
    }

    if (c.operation === "liquidate") {
      hasLiquidations = true;
      if (c.troveOperation) {
        liquidationDebtCleared += Math.abs(c.troveOperation.debtChangeFromOperation);
      }
      if (c.liquidation) {
        liquidationCollSurplus += c.liquidation.collSurplus;
      }
      continue;
    }

    // Standard trove operations
    if (c.troveOperation) {
      const debtChange = c.troveOperation.debtChangeFromOperation;
      const collChange = c.troveOperation.collChangeFromOperation;

      if (debtChange > 0) totalBorrowed += debtChange;
      else if (debtChange < 0) totalRepaid += Math.abs(debtChange);

      if (collChange > 0) totalCollateralDeposited += collChange;
      else if (collChange < 0) totalCollateralWithdrawn += Math.abs(collChange);

      totalUpfrontFees += c.troveOperation.debtIncreaseFromUpfrontFee || 0;
    }
  }

  const realizedPL = redemptionDebtCleared - redemptionCollValue;

  const liquidatedCollateral = sorted
    .filter((e) => e.context.data.operation === "liquidate" && e.context.data.troveOperation)
    .reduce((sum, e) => sum + Math.abs(e.context.data.troveOperation!.collChangeFromOperation), 0);
  const liquidatedCollSeized = Math.max(0, liquidatedCollateral - liquidationCollSurplus);

  const netCollateralChange =
    totalCollateralDeposited - totalCollateralWithdrawn - liquidatedCollateral - redemptionCollLost;

  // Interest: difference method (same as rails-web)
  const totalDebtRepaidOrCleared = totalRepaid + redemptionDebtCleared + liquidationDebtCleared;
  const totalDebtCreated = totalBorrowed + totalUpfrontFees;
  const interestAndManagementFees = Math.max(0, totalDebtRepaidOrCleared - totalDebtCreated);

  return {
    redemption: hasRedemptions
      ? {
          totalDebtCleared: redemptionDebtCleared,
          totalCollateralLost: redemptionCollLost,
          totalCollateralValueAtRedemption: redemptionCollValue,
          totalFeesRetained: redemptionFeesRetained,
          realizedPL,
        }
      : null,
    liquidation: hasLiquidations
      ? {
          totalDebtCleared: liquidationDebtCleared,
          totalCollateralSeized: liquidatedCollSeized,
          totalCollateralSurplus: liquidationCollSurplus,
        }
      : null,
    gas: {
      totalGasUsed: 0,
      totalGasCostEth,
      totalGasCostUsd,
    },
    costs: {
      totalInterestPaid: interestAndManagementFees,
      totalUpfrontFees,
      totalManagementFees: 0,
    },
    position: {
      totalBorrowed,
      totalRepaid,
      totalCollateralDeposited,
      totalCollateralWithdrawn,
      netCollateralChange,
    },
    _meta: {
      collateralType: ctx.collateralType,
      stablecoinSymbol: ctx.assetType || "BOLD",
      collateralAmount: ctx.stateAfter.coll,
      currentDebt: ctx.stateAfter.debt,
      interestRate: ctx.stateAfter.annualInterestRate,
      isInBatch: ctx.isInBatch,
      batchManagementFee: ctx.batchUpdate?.annualManagementFee ?? 0,
      isZombie: ctx.isZombieTrove,
      lastActivityAt: latest.timestamp,
      latestState: ctx.stateAfter,
      status:
        ctx.stateAfter.debt === 0 && ctx.stateAfter.coll === 0
          ? "closed"
          : ctx.operation === "liquidate"
            ? "liquidated"
            : "open",
    },
  };
}

// ---- Redeemer stats — a wallet that redeemed against someone else's trove ----
// Co-located with calculateEconomicsFromEvents (shares its ownedTroveIds
// derivation) rather than in redeemer-summary.tsx, so that component can
// import both without a cycle; it re-exports these two names alongside
// RedeemerSummary, so all three still live at one import path.

export interface RedeemerStats {
  totalDebtRedeemed: number;
  totalCollateralReceived: number;
  redemptionCount: number;
  uniqueTroves: number;
  totalGasCostEth: number;
  totalGasCostUsd: number;
  firstTimestamp: number;
  lastTimestamp: number;
  collateralType: string;
  stableSymbol: string;
}

export function calculateRedeemerStats(events: MinimalEvent[]): RedeemerStats | null {
  const liquityEvents = events.filter(isLiquityMinimal);

  // Mirror the ownedTroveIds derivation in calculateEconomicsFromEvents so the
  // wallet-scoped vs trove-scoped predicate stays symmetric.
  const OPEN_OPS = new Set(["openTrove", "openTroveAndJoinBatch"]);
  const ownedTroveIds = new Set<string>();
  for (const e of liquityEvents) {
    const c = e.context.data;
    if (OPEN_OPS.has(c.operation) && c.troveId) ownedTroveIds.add(c.troveId);
  }

  const redeemerEvents = liquityEvents.filter((e) => {
    const c = e.context.data;
    return c.operation === "redeemCollateral" && !!c.troveId && !ownedTroveIds.has(c.troveId);
  });
  if (redeemerEvents.length === 0) return null;

  const sorted = [...redeemerEvents].sort((a, b) => a.timestamp - b.timestamp);
  let totalDebtRedeemed = 0;
  let totalCollateralReceived = 0;
  let totalGasCostEth = 0;
  let totalGasCostUsd = 0;
  const troveIds = new Set<string>();

  for (const event of sorted) {
    const c = event.context.data;
    if (event.gas) {
      totalGasCostEth += event.gas.gasCostEth || 0;
      totalGasCostUsd += event.gas.gasCostUsd || 0;
    }
    if (c.troveOperation) {
      totalDebtRedeemed += Math.abs(c.troveOperation.debtChangeFromOperation);
      totalCollateralReceived += Math.abs(c.troveOperation.collChangeFromOperation);
    }
    if (c.troveId) troveIds.add(c.troveId);
  }

  const ctx = sorted[0].context.data;
  return {
    totalDebtRedeemed,
    totalCollateralReceived,
    redemptionCount: redeemerEvents.length,
    uniqueTroves: troveIds.size,
    totalGasCostEth,
    totalGasCostUsd,
    firstTimestamp: sorted[0].timestamp,
    lastTimestamp: sorted[sorted.length - 1].timestamp,
    collateralType: ctx.collateralType,
    stableSymbol: ctx.assetType || "BOLD",
  };
}

// ---- Tower projection ----

export interface LiquityEconomicsResult {
  data: ChainTruthTowerData;
  economics: TroveEconomicsType & { _meta: TroveMeta };
  redeemer: RedeemerStats | null;
}

export function computeLiquityEconomics(
  events: MinimalEvent[],
  opts: { currentPrice?: number; collateralType: string },
): LiquityEconomicsResult | null {
  const baseResult = calculateEconomicsFromEvents(events);
  const redeemer = calculateRedeemerStats(events);
  if (!baseResult) return null;

  const meta = baseResult._meta;
  const economics: TroveEconomicsType = {
    redemption: baseResult.redemption,
    liquidation: baseResult.liquidation,
    gas: baseResult.gas,
    costs: baseResult.costs,
    position: baseResult.position,
  };
  const { currentPrice } = opts;
  const collateralSymbol = meta.collateralType || opts.collateralType;
  const stableSymbol = meta.stablecoinSymbol;
  const redemption = economics.redemption;
  const liquidation = economics.liquidation ?? null;

  const priced = currentPrice != null && currentPrice > 0;
  const usdOf = (symbol: string, amount: number): number | null =>
    !priced ? null : symbol === stableSymbol ? amount : amount * (currentPrice as number);

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

  // Include pending interest so "Current Debt" matches reality — same
  // calculation the bespoke tower used.
  const entireDebt =
    meta.status === "open" && meta.currentDebt > 0
      ? meta.currentDebt +
        calculateAccruedInterest(meta.currentDebt, meta.interestRate, meta.lastActivityAt, Date.now() / 1000)
      : meta.currentDebt;

  // Total interest including what's still outstanding in current debt —
  // the bespoke tower's "difference method": everything repaid, redeemed,
  // liquidated, or still owed, minus principal borrowed and upfront fees.
  const totalInterestAndMgmtFees = Math.max(
    0,
    entireDebt +
      economics.position.totalRepaid +
      (redemption?.totalDebtCleared ?? 0) +
      (liquidation?.totalDebtCleared ?? 0) -
      economics.position.totalBorrowed -
      economics.costs.totalUpfrontFees,
  );

  // Split interest vs delegate fees — meta.interestRate already includes the
  // management fee for batched troves.
  const apiMgmtFees = economics.costs.totalManagementFees ?? 0;
  const mgmtRate = meta.isInBatch ? meta.batchManagementFee : 0;
  const totalRate = meta.interestRate;
  const delegateFees =
    apiMgmtFees > 0
      ? Math.min(apiMgmtFees, totalInterestAndMgmtFees)
      : mgmtRate > 0 && totalRate > 0
        ? totalInterestAndMgmtFees * (mgmtRate / totalRate)
        : 0;
  const interestAccrued = Math.max(0, totalInterestAndMgmtFees - delegateFees);

  // Liquidated collateral, net of any claimable surplus.
  const hasLiquidationEvents = events.some((e) => isLiquityMinimal(e) && e.context.data.operation === "liquidate");
  const rawLiquidatedColl = Math.max(
    0,
    economics.position.totalCollateralDeposited +
      (redemption?.totalFeesRetained ?? 0) -
      meta.collateralAmount -
      economics.position.totalCollateralWithdrawn -
      (redemption?.totalCollateralLost ?? 0),
  );
  const liquidatedColl = hasLiquidationEvents && rawLiquidatedColl > 0.0001 ? rawLiquidatedColl : 0;
  const claimableSurplus = liquidation?.totalCollateralSurplus ?? 0;
  const liquidatedSeized = claimableSurplus > 0 ? Math.max(0, liquidatedColl - claimableSurplus) : liquidatedColl;
  const feesReceivedColl = redemption?.totalFeesRetained ?? 0;

  const contributing = [
    meta.collateralAmount,
    economics.position.totalCollateralWithdrawn,
    liquidatedSeized,
    redemption?.totalCollateralLost ?? 0,
    feesReceivedColl,
    claimableSurplus,
  ].some((v) => v > DUST);
  const valued = contributing && priced;

  // ── Collateral side ──────────────────────────────────────────────────
  const collCurrent: TowerLine[] =
    meta.collateralAmount > DUST
      ? [
          line(
            "current-coll",
            collateralSymbol,
            meta.collateralAmount,
            collCurrentProv(collateralSymbol, meta.latestState),
          ),
        ]
      : [];
  const collExited: TowerLine[] = [
    ...(economics.position.totalCollateralWithdrawn > DUST
      ? [line("coll-withdrawn", collateralSymbol, economics.position.totalCollateralWithdrawn, collWithdrawnProv)]
      : []),
    ...((redemption?.totalCollateralLost ?? 0) > DUST
      ? [
          line(
            "coll-redeemed",
            collateralSymbol,
            redemption!.totalCollateralLost,
            collRedeemedProv,
            "Redeemed",
            "redeemed",
          ),
        ]
      : []),
  ];
  const collLiquidated: TowerLine[] =
    liquidatedSeized > DUST ? [line("coll-liquidated", collateralSymbol, liquidatedSeized, collLiquidatedProv)] : [];
  const collReceived: TowerLine[] =
    feesReceivedColl > DUST
      ? [line("coll-fees-received", collateralSymbol, feesReceivedColl, collFeesReceivedProv, "Fees received")]
      : [];
  const collClaimable: TowerLine[] =
    claimableSurplus > DUST
      ? [line("coll-claimable", collateralSymbol, claimableSurplus, collClaimableProv, "Claimable")]
      : [];

  // ── Debt side ────────────────────────────────────────────────────────
  // The shared tower stacks `current` + `interest` as the "currently owed"
  // total, so the lifetime Interest-Accrued figure is split OUT of
  // entireDebt here (capped at entireDebt as a safety guard — in every real
  // trove interest is a small fraction of the total) rather than shown as
  // one undivided block the way the bespoke tower drew it. The auto-
  // generated "Current debt" result row the shared tower prints is their
  // sum, so the headline figure still equals entireDebt exactly.
  const interestForTower = Math.min(interestAccrued, entireDebt);
  const principalForTower = Math.max(0, entireDebt - interestForTower);
  const debtCurrent: TowerLine[] =
    principalForTower > DUST ? [line("current-debt", stableSymbol, principalForTower, debtCurrentProv)] : [];
  const debtInterest: TowerLine | null =
    interestForTower > DUST ? line("interest-accrued", stableSymbol, interestForTower, debtInterestProv) : null;
  const debtExited: TowerLine[] = [
    ...(economics.position.totalRepaid > DUST
      ? [line("debt-repaid", stableSymbol, economics.position.totalRepaid, debtRepaidProv)]
      : []),
    ...((redemption?.totalDebtCleared ?? 0) > DUST
      ? [line("debt-redeemed", stableSymbol, redemption!.totalDebtCleared, debtRedeemedProv, "Redeemed", "redeemed")]
      : []),
  ];
  const debtLiquidated: TowerLine[] =
    (liquidation?.totalDebtCleared ?? 0) > DUST
      ? [line("debt-liquidated", stableSymbol, liquidation!.totalDebtCleared, debtLiquidatedProv)]
      : [];
  const debtCosts: TowerLine[] = [
    ...(economics.costs.totalUpfrontFees > DUST
      ? [line("debt-upfront-fees", stableSymbol, economics.costs.totalUpfrontFees, debtUpfrontFeesProv, "Upfront fees")]
      : []),
    ...(delegateFees > DUST
      ? [line("debt-delegate-fees", stableSymbol, delegateFees, debtDelegateFeesProv, "Delegate fees")]
      : []),
  ];

  const inflow = (amount: number, symbol: string): number => {
    if (amount <= DUST) return 0;
    return valued ? (usdOf(symbol, amount) ?? 0) : amount;
  };

  const data: ChainTruthTowerData = {
    valued,
    priceKind: valued ? "chain-derived" : undefined,
    collateral: {
      current: collCurrent,
      interest: null,
      exited: collExited,
      liquidated: collLiquidated,
      received: collReceived,
      claimable: collClaimable,
      lifetimeInflow: inflow(economics.position.totalCollateralDeposited, collateralSymbol),
    },
    debt: {
      current: debtCurrent,
      interest: debtInterest,
      exited: debtExited,
      liquidated: debtLiquidated,
      costs: debtCosts,
      lifetimeInflow: inflow(economics.position.totalBorrowed, stableSymbol),
    },
    flowsNote:
      "The tower shows the trove as it stands; every inflow and outflow that produced it is in the timeline below, event by event.",
  };

  return { data, economics: { ...economics, _meta: meta }, redeemer };
}
