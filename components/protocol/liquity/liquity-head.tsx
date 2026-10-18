"use client";

// Liquity V2's T1 head as a spec for the shared row (`ChainTruthRow`,
// components/shared/chain-truth-event.tsx; ui-jobs 309 step 2).
//
// The timeline's head (mode "row", ui-jobs 367) is words: the past-participle
// kind, in its status pill where it has one, then the clauses for what the
// spine cannot show (`liquityT1Words`). The spine carries the figures; the
// head keeps a pending debt's figure, whose spine draws no flank, a
// redistribution's arrival and the same-block "n of m".
//
// The event page's title (mode "title") states the word or the status pill,
// the amounts the event moved, the rate pills and the batch manager, a
// redistribution's arrival, a liquidation's surplus, the gas compensation
// escrow on the open and the close, the zombie flag and the same-block
// "n of m". The words are the generator's (`liquityL1Label`,
// content/liquity-v2/event-prose.yaml).

import type { LiquityContext } from "@/lib/shared/types/protocols/liquity";
import { getBatchManagerName } from "@/lib/liquity/batch-managers";
import { liquityL1Label, liquityT1Words, type LiquityT1Clause } from "@/lib/liquity/event-prose";
import { L1_WORDS } from "@/lib/liquity/event-templates";
import { zombieTitle } from "@/lib/liquity/trove-page-words";
import {
  collChangeProv,
  debtChangeProv,
  rateAfterProv,
  liquityRedistOnAdjust,
  redistArrivalProv,
  liquityGasEscrowProv,
  LIQUITY_V2_GAS_ESCROW,
  transferPartyProv,
  liquidationSurplusProv,
  type EventCoords,
} from "@/lib/liquity/event-provenance";
import { formatDate } from "@/lib/date";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { Prov } from "@/components/shared/provenance";
import { formatExact } from "@/lib/utils/format";
import { useSurplusClaimFor } from "@/components/protocol/liquity-family/coll-surplus-context";
import {
  ChainTruthRow,
  PartyChip,
  useSameTransaction,
  type ChainTruthDelta,
  type ChainTruthRowSpec,
} from "@/components/shared/chain-truth-event";

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

/** One clause of the timeline head, drawn. */
function clauseNode(c: LiquityT1Clause, ctx: LiquityContext, coords: EventCoords) {
  if ("text" in c)
    return c.zombie ? <span title={zombieTitle(ctx.stateAfter?.debt === 0)}>{c.text}</span> : <span>{c.text}</span>;
  if ("delegate" in c)
    return (
      <span>
        {c.lead} <span className="font-bold text-pink-500">{c.delegate}</span>
      </span>
    );
  if ("surplus" in c)
    // The one figure the head states: the collateral the holder can claim.
    return (
      <>
        <Prov info={liquidationSurplusProv(ctx, coords)} value={formatExact(c.surplus)} symbol={c.symbol}>
          <span className="font-bold text-foreground">{c.surplus.toFixed(4)}</span>
        </Prov>
        <TokenChipIcon symbol={c.symbol} size={16} />
        <span className={c.claimedAt === undefined ? "text-green-700 dark:text-green-400" : undefined}>
          {c.word}
          {c.claimedAt != null && <> {formatDate(c.claimedAt)}</>}
        </span>
      </>
    );
  return (
    <PartyChip party={{ prefix: c.lead, address: c.address, prov: transferPartyProv(c.dir, coords), ens: true }} />
  );
}

/** The head of one Liquity V2 event: the timeline's ("row") or the event
 *  page's title. `claimed`: the liquidation's surplus has since been claimed
 *  (the head read). `wallet`: the account the timeline reads. */
export function liquityHeadSpec(
  ctx: LiquityContext,
  coords: EventCoords,
  claimed?: { timestamp?: number | null } | null,
  mode: "row" | "title" = "title",
  wallet?: string,
): ChainTruthRowSpec {
  const spec = titleSpec(ctx, coords, claimed);
  if (mode === "title") return spec;
  const op = ctx.operation;
  const words = liquityT1Words(ctx, { wallet, surplusClaimed: claimed });
  return {
    label: words.kind,
    status: spec.status,
    critical: spec.critical,
    labelOnSpine: spec.labelOnSpine,
    labelTone: op === "setBatchManagerAnnualInterestRate" ? "delegate" : undefined,
    clauses: words.clauses.map((c) => clauseNode(c, ctx, coords)),
    // A pending debt's spine draws no flank: its figure stays in the head.
    deltas: op === "applyPendingDebt" ? spec.deltas : [],
    redistribution: spec.redistribution,
    sameBlock: spec.sameBlock,
  };
}

/** The event page's title spec. */
function titleSpec(
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
  if (!stateAfter || !stateBefore) return { label, status, deltas: [] };

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
  const pill = (tone?: "delegate", lead?: boolean, onSpine?: boolean): ChainTruthRowSpec["ratePill"] => ({
    pct: rate,
    tone,
    prov: rateP?.info,
    echoValue: rateP?.value,
    lead,
    onSpine,
  });
  const manager = ctx.batchManager ? getBatchManagerName(ctx.batchManager) : undefined;

  const spec: ChainTruthRowSpec = { label, status, deltas: [] };
  if (op === "setBatchManagerAnnualInterestRate") {
    // The manager moved the rate and nothing else: the debt's move since the
    // Trove's previous event (interest, the management fee, any upfront fee)
    // stands in the opened card's Debt side and the explanation. The rate
    // stands on the spine's flank, as on a join; the delegate is named on
    // the join alone.
    spec.ratePill = pill("delegate", true, true);
  } else if (op === "setInterestBatchManager") {
    if (rate > 0) spec.ratePill = pill("delegate", true, true);
    spec.manager = manager;
  } else if (op === "openTrove" || op === "openTroveAndJoinBatch") {
    spec.deltas = [
      ...(hasColl ? [coll({ label: L1_WORDS.supply, axisVerb: true })] : []),
      ...(hasDebt ? [debt({ label: L1_WORDS.borrow, axisVerb: true })] : []),
    ];
    // The rate stands on the spine, below the two legs.
    if (rate > 0) spec.ratePill = pill(op === "openTroveAndJoinBatch" ? "delegate" : undefined, false, true);
    // An open-and-join is the Trove's first join: it names the delegate.
    if (op === "openTroveAndJoinBatch") spec.manager = manager;
  } else if (op === "redeemCollateral") {
    // The word in the caution tone; the spine draws the legs as two nodes.
    // On a pinned event page below sm, the legs follow the word: the
    // debt it cleared, then the collateral it reduced.
    spec.labelOnSpine = true;
    spec.deltas = [
      ...(hasDebt ? [debt({ label: L1_WORDS.cleared, debtSide: true })] : []),
      ...(hasColl ? [coll({ label: L1_WORDS.reduced })] : []),
    ];
    if (ctx.isZombieTrove)
      spec.zombie = {
        word: L1_WORDS.zombie,
        title: zombieTitle(stateAfter.debt === 0),
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

  // The gas compensation escrow, the owner's WETH held apart from the
  // collateral: sent to the GasPool at the open, returned at the close. The
  // logs of the Trove do not carry it; the amount is the protocol's constant.
  // The spine draws it (liquity-event-card.tsx); a liquidation states its
  // payment to the liquidator in the sheet.
  if (op === "openTrove" || op === "openTroveAndJoinBatch" || op === "closeTrove") {
    const close = op === "closeTrove";
    const e = LIQUITY_V2_GAS_ESCROW;
    spec.deltas.push({
      value: close ? -e.amount : e.amount,
      symbol: e.symbol,
      address: e.address,
      label: L1_WORDS.escrow_leg,
      axisVerb: true,
      exact: String(e.amount),
      prov: liquityGasEscrowProv(close ? "returned" : "sent", coords),
    });
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

  // The rate a move set, after the amounts, where the spine's flank does not
  // carry it.
  if ((op === "adjustTroveInterestRate" || op === "removeFromBatch") && rate > 0)
    spec.ratePill = pill(undefined, false, true);

  if (ctx.blockGrouping?.isGrouped)
    spec.sameBlock = { index: ctx.blockGrouping.sameBlockIndex, count: ctx.blockGrouping.sameBlockCount };
  return spec;
}

/** The spec, with the surplus claim the page has read. */
export function useLiquityHeadSpec(
  ctx: LiquityContext,
  coords: EventCoords,
  mode: "row" | "title" = "title",
  wallet?: string,
): ChainTruthRowSpec {
  const claim = useSurplusClaimFor(ctx.operation === "liquidate" ? coords.txHash : undefined);
  const sameTransaction = useSameTransaction(
    coords.blockNumber,
    coords.txHash,
    ctx.blockGrouping?.isGrouped ? ctx.blockGrouping.sameBlockCount : 0,
  );
  const spec = liquityHeadSpec(ctx, coords, claim, mode, wallet);
  return sameTransaction && spec.sameBlock ? { ...spec, sameBlock: { ...spec.sameBlock, sameTransaction } } : spec;
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
