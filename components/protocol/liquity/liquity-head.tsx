"use client";

// Liquity V2's T1 head as a spec for the shared row (`ChainTruthRow`,
// components/shared/chain-truth-event.tsx; ui-jobs 309 step 2): the word or
// the status pill, the amounts the event moved, the rate pills and the batch
// manager, a redistribution's arrival, a liquidation's surplus, the zombie
// flag and the same-block "n of m". The words are the generator's
// (`liquityL1Label`, content/liquity-v2/event-prose.yaml).

import type { LiquityContext } from "@/lib/shared/types/protocols/liquity";
import { getBatchManagerName } from "@/lib/liquity/batch-managers";
import { liquityL1Label } from "@/lib/liquity/event-prose";
import { L1_WORDS } from "@/lib/liquity/event-templates";
import {
  collChangeProv,
  debtChangeProv,
  rateAfterProv,
  liquityRedistOnAdjust,
  redistArrivalProv,
  type EventCoords,
} from "@/lib/liquity/event-provenance";
import { useSurplusClaimFor } from "@/components/protocol/liquity-family/coll-surplus-context";
import { ChainTruthRow, type ChainTruthDelta, type ChainTruthRowSpec } from "@/components/shared/chain-truth-event";

/** The operations whose head states its amounts in its branch, or none. */
const OWN_AMOUNTS = new Set([
  "openTrove",
  "openTroveAndJoinBatch",
  "redeemCollateral",
  "liquidate",
  "adjustTroveInterestRate",
  "setBatchManagerAnnualInterestRate",
  "setInterestBatchManager",
]);

/** The status pill a word takes (on the event page every one of them; in the
 *  timeline's head the open, close, pending-debt and zombie ones). */
function statusOf(operation: string): ChainTruthRowSpec["status"] {
  switch (operation) {
    case "openTrove":
    case "openTroveAndJoinBatch":
      return "open";
    case "closeTrove":
      return "close";
    case "applyPendingDebt":
      return "party";
    case "adjustZombieTrove":
    case "adjustUnredeemableZombieTrove":
      return "marker";
    default:
      return undefined;
  }
}

/** The head of one Liquity V2 event. `claimed`: the liquidation's surplus
 *  has since been claimed (the head read). */
export function liquityHeadSpec(
  ctx: LiquityContext,
  coords: EventCoords,
  claimed?: { timestamp?: number | null } | null,
): ChainTruthRowSpec {
  const label = liquityL1Label(ctx);
  const op = ctx.operation;
  const { stateBefore, stateAfter } = ctx;
  const collSym = ctx.collateralType;
  const debtSym = ctx.assetType ?? "BOLD";
  const status = statusOf(op);
  if (!stateAfter || !stateBefore) return { label, status, deltas: [], unsignedDeltas: true };

  const collCp = collChangeProv(ctx, coords);
  const debtCp = debtChangeProv(ctx, coords);
  const rateP = rateAfterProv(ctx, coords);
  const debtChange = debtCp?.change ?? 0;
  const collChange = collCp?.change ?? 0;
  const hasDebt = Math.abs(debtChange) >= 0.01 && !!debtCp;
  const hasColl = Math.abs(collChange) >= 0.01 && !!collCp;
  const coll = (extra: Partial<ChainTruthDelta>): ChainTruthDelta => ({
    value: collChange,
    symbol: collSym,
    prov: collCp!.info,
    exact: collCp!.value,
    ...extra,
  });
  const debt = (extra: Partial<ChainTruthDelta>): ChainTruthDelta => ({
    value: debtChange,
    symbol: debtSym,
    prov: debtCp!.info,
    exact: debtCp!.value,
    ...extra,
  });
  const rate = stateAfter.annualInterestRate;
  const pill = (tone?: "delegate", lead?: boolean): ChainTruthRowSpec["ratePill"] => ({
    pct: rate,
    tone,
    prov: rateP?.info,
    echoValue: rateP?.value,
    lead,
  });
  const manager = ctx.batchManager ? getBatchManagerName(ctx.batchManager) : undefined;

  const spec: ChainTruthRowSpec = { label, status, deltas: [], unsignedDeltas: true };
  if (op === "setBatchManagerAnnualInterestRate") {
    // The debt's move since the Trove's previous event: interest, the
    // management fee and any upfront fee, split in the explanation. The spine
    // carries no value on a rate change, so the figure stays at every width.
    spec.ratePill = pill("delegate", true);
    spec.manager = manager;
    if (hasDebt) spec.deltas = [debt({ label: L1_WORDS.debt, signed: true, axisVerb: true, noSpineCounterpart: true })];
  } else if (op === "setInterestBatchManager") {
    if (rate > 0) spec.ratePill = pill("delegate", true);
    spec.manager = manager;
  } else if (op === "openTrove" || op === "openTroveAndJoinBatch") {
    spec.deltas = [
      ...(hasColl ? [coll({ label: L1_WORDS.supply, axisVerb: true })] : []),
      ...(hasDebt ? [debt({ label: L1_WORDS.borrow, axisVerb: true })] : []),
    ];
    if (rate > 0) spec.ratePill = pill(op === "openTroveAndJoinBatch" ? "delegate" : undefined);
  } else if (op === "redeemCollateral") {
    // The word in the caution tone; the spine draws the legs as two nodes.
    // With Timeline values off, or below sm, the legs follow the word: the
    // debt it cleared, then the collateral it reduced.
    spec.labelOnSpine = true;
    spec.deltas = [
      ...(hasDebt ? [debt({ label: L1_WORDS.cleared, debtSide: true })] : []),
      ...(hasColl ? [coll({ label: L1_WORDS.reduced })] : []),
    ];
    if (ctx.isZombieTrove)
      spec.zombie = {
        word: L1_WORDS.zombie,
        title:
          stateAfter.debt === 0
            ? "Zombie trove fully redeemed — debt cleared, collateral now claimable"
            : "Zombie trove — debt below the minimum, redeemable until restored",
      };
  } else if (op === "liquidate") {
    spec.critical = true;
    spec.deltas = [
      ...(hasColl ? [coll({ label: L1_WORDS.liquidated })] : []),
      ...(hasDebt ? [debt({ label: L1_WORDS.cleared, debtSide: true })] : []),
    ];
    // The collateral the liquidation left over the debt, claimable by the
    // owner; muted, with the date, once claimed.
    if (ctx.liquidation && ctx.liquidation.collSurplus > 0)
      spec.surplus = {
        amount: ctx.liquidation.collSurplus,
        symbol: collSym,
        word: claimed ? L1_WORDS.claimed : L1_WORDS.claimable,
        claimed: claimed ? { timestamp: claimed.timestamp } : undefined,
      };
  } else if (!status && label.includes(" + ")) {
    // A combined action ("Withdraw + Repay"): each axis carries its verb.
    const [collAction, debtAction] = label.split(" + ");
    spec.label = "";
    spec.deltas = [
      ...(hasColl ? [coll({ label: collAction, axisVerb: true })] : []),
      ...(hasDebt ? [debt({ label: debtAction, axisVerb: true })] : []),
    ];
  }

  // The amounts the other operations moved: the debt, then the collateral. A
  // pending-debt row's spine draws no flank, so its figure stays.
  if (!OWN_AMOUNTS.has(op) && !label.includes(" + ")) {
    const stays = op === "applyPendingDebt";
    spec.deltas = [
      ...(hasDebt ? [debt({ noSpineCounterpart: stays })] : []),
      ...(hasColl ? [coll({ noSpineCounterpart: stays })] : []),
    ];
  }

  // A liquidated neighbour's redistribution this adjust applied, in the
  // caution tone, so inherited debt never reads as part of a repayment or a
  // borrow. No token moved for it.
  const redist = liquityRedistOnAdjust(ctx);
  if (redist) {
    const d = redist.debt >= 0.01 ? redistArrivalProv(ctx, "debt", coords) : undefined;
    const c = redist.coll > 1e-9 ? redistArrivalProv(ctx, "coll", coords) : undefined;
    spec.redistribution = {
      label: L1_WORDS.from_liquidation,
      and: L1_WORDS.and,
      deltas: [
        ...(d ? [{ value: d.change, symbol: debtSym, prov: d.info, exact: d.value }] : []),
        ...(c ? [{ value: c.change, symbol: collSym, prov: c.info, exact: c.value }] : []),
      ],
    };
  }

  // The rate a move set, after the amounts.
  if ((op === "adjustTroveInterestRate" || op === "removeFromBatch") && rate > 0) spec.ratePill = pill();

  if (ctx.blockGrouping?.isGrouped)
    spec.sameBlock = { index: ctx.blockGrouping.sameBlockIndex, count: ctx.blockGrouping.sameBlockCount };
  return spec;
}

/** The spec, with the surplus claim the page has read. */
export function useLiquityHeadSpec(ctx: LiquityContext, coords: EventCoords): ChainTruthRowSpec {
  const claim = useSurplusClaimFor(ctx.operation === "liquidate" ? coords.txHash : undefined);
  return liquityHeadSpec(ctx, coords, claim);
}

/** The event page's title (ui-jobs 286): the head's words and amounts, large,
 *  as the side column's h1. */
export function LiquityEventTitle({
  ctx,
  timestamp,
  txHash,
  blockNumber,
}: {
  ctx: LiquityContext;
  timestamp: number;
  txHash?: string;
  blockNumber?: number;
}) {
  const spec = useLiquityHeadSpec(ctx, { txHash, blockNumber });
  return <ChainTruthRow spec={spec} timestamp={timestamp} variant="title" />;
}
